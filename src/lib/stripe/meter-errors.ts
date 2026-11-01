import type Stripe from 'stripe';
import type { Db } from 'mongodb';
import { Collections } from '@/lib/mongodb';
import type { UsageEvent } from './usage-queue';
import { usageMeterContract } from './usage-meter';
import { assertArchivedUsageTariff } from './catalog-publication';

export type MeterErrorEvent = Stripe.V2.Core.Events.V1BillingMeterErrorReportTriggeredEvent | Stripe.V2.Core.Events.V1BillingMeterNoMeterFoundEvent;
type MeterErrorNotification = { id: string; type: MeterErrorEvent['type']; fetchEvent(): Promise<MeterErrorEvent> };

/** fetchEvent() returns plain event data in Stripe 23. Retrieve the authoritative
 * meter by its validated ID rather than assuming a runtime SDK helper exists. */
export async function fetchAndReconcileMeterNotification(notification: MeterErrorNotification, db: Db,
    retrieveMeter: (id: string) => Promise<{ id: string; event_name: string }>) {
    const event = await notification.fetchEvent();
    if (event.id !== notification.id || event.type !== notification.type) throw new Error('The authoritative meter event does not match its signed notification.');
    // Managed billing uses this platform account, with no Connect accounts.
    if (event.context) throw new Error('Managed meter notifications require platform account context.');
    let meter;
    if (event.type === 'v1.billing.meter.error_report_triggered') {
        if (event.related_object?.type !== 'billing.meter' || !event.related_object.id?.startsWith('mtr_')) throw new Error('The authoritative meter reference is invalid.');
        meter = await retrieveMeter(event.related_object.id);
    }
    return reconcileMeterErrorReport(event, db, meter);
}

/** Error reports contain samples, not a list of every failed customer. */
export async function reconcileMeterErrorReport(event: MeterErrorEvent, db: Db, meter?: { id: string; event_name: string }) {
    const start = Math.floor(Date.parse(event.data.validation_start) / 1000);
    const end = Math.ceil(Date.parse(event.data.validation_end) / 1000);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error('Invalid meter validation window.');
    if (event.type === 'v1.billing.meter.error_report_triggered' && (!meter || meter.id !== event.related_object.id)) {
        throw new Error('The authoritative meter does not match the error report.');
    }
    const events = db.collection<UsageEvent>(Collections.USAGE_EVENTS);
    const samples = event.data.reason.error_types.flatMap(type => type.sample_errors.map(sample => ({
        identifier: typeof sample.request?.identifier === 'string' && sample.request.identifier.length ? sample.request.identifier : undefined,
        code: type.code,
    })));
    const scopes = new Map<string, { customerId: string; type: UsageEvent['type']; meterPriceId: string; meterId: string; eventName: string; usageTier: 'recurring' | 'lifetime' }>();
    let rejected = 0, unmatched = 0;
    for (const sample of samples) {
        if (!sample.identifier) { unmatched++; continue; }
        const separator = sample.identifier.lastIndexOf(':');
        const id = sample.identifier.slice(0, separator), value = Number(sample.identifier.slice(separator + 1));
        const row = separator > 0 && Number.isSafeInteger(value) && value > 0 ? await events.findOne({ _id: id }) : null;
        // A delayed error for an earlier storage delivery cannot reject a newer,
        // successfully delivered peak, and a settled invoice is immutable here.
        if (!row || !row.tariff
            || row.state === 'billed' || row.invoiceId || row.billedAt
            || ![row.reportedValue, row.delivery?.value, ...(row.reportedValue === 0 ? [row.value] : [])].includes(value)) {
            unmatched++; continue;
        }
        let contract;
        try {
            contract = usageMeterContract(row);
            if (meter && (contract.meterId !== meter.id || contract.eventName !== meter.event_name)) { unmatched++; continue; }
            await assertArchivedUsageTariff(row.tariff, db);
        } catch { unmatched++; continue; }
        const result = await events.updateOne({ _id: row._id, reportedValue: row.reportedValue,
            state: { $ne: 'billed' }, invoiceId: { $exists: false }, billedAt: { $exists: false } }, {
            $set: { pending: false, state: 'rejected', processingStatus: 'rejected', reviewReason: sample.code },
        });
        if (!result.matchedCount) { unmatched++; continue; }
        rejected++;
        if (meter) scopes.set(`${row.customerId}:${contract.meterId}:${contract.priceId}`, { customerId: row.customerId,
            type: contract.type, meterPriceId: contract.priceId, meterId: contract.meterId, eventName: contract.eventName, usageTier: contract.usageTier });
    }
    let quarantined = 0;
    // Only a known meter and sampled customer justify reviewing nearby unbilled
    // receipts. A no-meter report identifies only its exact samples.
    for (const scope of scopes.values()) {
        const candidates = await events.find({ customerId: scope.customerId, type: scope.type,
            meterPriceId: scope.meterPriceId, 'tariff.meterId': scope.meterId,
            timestamp: { $gte: start, $lte: end }, value: { $gt: 0 },
            state: { $nin: ['billed', 'rejected'] }, invoiceId: { $exists: false }, billedAt: { $exists: false },
        }).limit(1000).toArray();
        for (const row of candidates) {
            try {
                if (usageMeterContract(row).eventName !== scope.eventName) continue;
                await assertArchivedUsageTariff(row.tariff!, db);
            } catch { continue; }
            const result = await events.updateOne({ _id: row._id, state: { $nin: ['billed', 'rejected'] },
                invoiceId: { $exists: false }, billedAt: { $exists: false } }, {
                $set: { pending: false, state: 'needs_review', processingStatus: 'needs_review', reviewReason: 'provider_meter_error_report' },
            });
            quarantined += result.matchedCount;
        }
    }
    const unsampledErrors = Math.max(0, event.data.reason.error_count - samples.length);
    return { eventType: event.type, meterId: meter?.id, meterType: scopes.values().next().value?.type, usageTier: scopes.values().next().value?.usageTier, validationStart: event.data.validation_start,
        validationEnd: event.data.validation_end, totalErrors: event.data.reason.error_count,
        sampledIdentifiers: samples.flatMap(sample => sample.identifier ? [sample.identifier] : []),
        missingIdentifiers: samples.filter(sample => !sample.identifier).length, rejected, quarantined, unmatched, unsampledErrors,
        requiresReview: unsampledErrors > 0 || unmatched > 0 || quarantined > 0 };
}

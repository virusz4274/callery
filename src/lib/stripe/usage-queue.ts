import { hasBlockingBillingReview } from './financial-review';
import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import type { Db } from 'mongodb';
import { getStripe } from '@/lib/stripe';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { User } from '@/lib/db/types';
import type { UsagePricingTier } from './catalog';
import { parseUnitPriceAtoms, type UsageTariffSnapshot } from './usage-tariff';
import { assertArchivedUsageTariff } from './catalog-publication';
import { isDeepStrictEqual } from 'node:util';
import { usageMeterContract } from './usage-meter';
import { MongoServerError } from 'mongodb';
import { completeInvoiceLines } from './invoice-funding';
import { invoiceLinePriceId } from './objects';

export interface UsageEvent {
    _id: string;
    authSubject: string;
    customerId: string;
    type: 'storage' | 'transcription';
    value: number;
    reportedValue: number;
    pending: boolean;
    timestamp: number;
    createdAt: Date;
    updatedAt: Date;
    retryAt: Date;
    leaseUntil: Date;
    leaseOwner?: string;
    lastError?: string;
    catalogVersion?: string;
    state?: 'pending' | 'accepted' | 'billed' | 'needs_review' | 'rejected';
    processingStatus?: 'pending' | 'accepted' | 'processed' | 'needs_review' | 'rejected';
    reviewReason?: string;
    firstAttemptAt?: Date;
    submittedAt?: Date;
    periodStart?: Date;
    periodEnd?: Date;
    requestId?: string;
    meterPriceId?: string;
    usageTier?: UsagePricingTier;
    eventName?: string;
    unitAmountMicros?: number;
    tariff?: UsageTariffSnapshot;
    invoiceId?: string;
    invoiceLineId?: string;
    billedAt?: Date;
    billedQuantity?: number;
    delivery?: { value: number; timestamp: number };
}

type SendMeterEvent = (event: UsageEvent) => Promise<void>;
export class UsageDeliveryReviewError extends Error {}

async function sendMeterEvent(event: UsageEvent): Promise<void> {
    const database = await getMongoDb();
    const user = await database.collection<User>(Collections.USERS).findOne({ authSubject: event.authSubject }) || await database.collection<User>('billing_deleted_accounts').findOne({ authSubject: event.authSubject });
    if (hasBlockingBillingReview(user?.billingReview)) throw new Error('Usage delivery is waiting for billing review. The receipt is retained.');
    if (event.periodEnd && event.periodEnd.getTime() < Date.now()) {
        const stripe = getStripe(); let draft = false;
        const expectedPrice = event.meterPriceId || (event.type === 'storage' ? user?.stripeMetering?.storagePriceId : user?.stripeMetering?.transcriptionPriceId);
        for await (const invoice of stripe.invoices.list({ customer: event.customerId, limit: 100 })) {
            const lines = await completeInvoiceLines(stripe, invoice);
            if (!lines.some(line => invoiceLinePriceId(line) === expectedPrice && line.period.start <= event.timestamp && line.period.end > event.timestamp)) continue;
            if (invoice.status !== 'draft') throw new UsageDeliveryReviewError('The applicable usage invoice has finalized. Do not retimestamp or create a catch-up charge.');
            draft = true; break;
        }
        if (!draft) throw new UsageDeliveryReviewError('The applicable late-usage draft invoice could not be established.');
    }
    const identifier = `${event._id}:${event.value}`;
    await getStripe().billing.meterEvents.create({
        identifier,
        event_name: usageMeterContract(event).eventName,
        payload: { stripe_customer_id: event.customerId, value: String(event.value) },
        timestamp: event.timestamp,
    }, { idempotencyKey: identifier });
}

/** One lease per account/period prevents smaller peaks arriving after larger ones. */
export async function flushUsageEvents(
    limit = 50,
    dependencies?: { db: Db; send: SendMeterEvent },
): Promise<{ sent: number; failed: number }> {
    const db = dependencies?.db || await getMongoDb();
    const send = dependencies?.send || sendMeterEvent;
    const events = db.collection<UsageEvent>(Collections.USAGE_EVENTS);
    const result = { sent: 0, failed: 0 };
    for (let i = 0; i < limit; i++) {
        const now = new Date();
        const owner = randomUUID();
        const event = await events.findOneAndUpdate(
            { pending: true, state: { $nin: ['needs_review', 'rejected'] }, retryAt: { $lte: now }, leaseUntil: { $lte: now } },
            [{ $set: {
                leaseOwner: owner,
                leaseUntil: new Date(now.getTime() + 5 * 60_000),
                delivery: { $ifNull: ['$delivery', { value: '$value', timestamp: '$timestamp' }] },
            } }],
            { sort: { createdAt: 1 }, returnDocument: 'after' },
        );
        if (!event) break;
        const expired = event.timestamp < Math.floor(Date.now() / 1000) - 35 * 86400;
        const uncertain = event.firstAttemptAt && now.getTime() - event.firstAttemptAt.getTime() >= 23 * 3600_000;
        if (expired || uncertain || !event.tariff) {
            await events.updateOne({ _id: event._id, leaseOwner: owner }, { $set: { pending: false, state: 'needs_review', processingStatus: 'needs_review', reviewReason: expired ? 'timestamp_expired' : uncertain ? 'delivery_result_unknown' : 'legacy_usage_requires_reconciliation' }, $unset: { leaseOwner: '' } });
            result.failed++; continue;
        }
        try {
            try { usageMeterContract(event); await assertArchivedUsageTariff(event.tariff!, db); }
            catch { throw new UsageDeliveryReviewError('The accepted usage tariff does not match its immutable meter.'); }
            if (!event.firstAttemptAt) await events.updateOne({ _id: event._id, leaseOwner: owner }, { $set: { firstAttemptAt: now } });
            const delivery = event.delivery!;
            await send({ ...event, value: delivery.value, timestamp: delivery.timestamp });
            const accepted = await events.updateOne({ _id: event._id, leaseOwner: owner,
                state: { $nin: ['rejected', 'needs_review', 'billed'] }, invoiceId: { $exists: false }, billedAt: { $exists: false } }, [
                { $set: { reportedValue: { $max: ['$reportedValue', delivery.value] }, state: 'accepted', processingStatus: 'accepted', submittedAt: new Date() } },
                { $set: { pending: { $gt: ['$value', '$reportedValue'] }, leaseUntil: new Date(0), updatedAt: new Date() } },
                { $unset: ['leaseOwner', 'lastError', 'delivery', 'firstAttemptAt'] },
            ]);
            if (!accepted.matchedCount) {
                // A signed asynchronous error or invoice settlement can win
                // while the request is in flight. Keep that financial state and
                // immutable delivery evidence; an SDK acknowledgment cannot clear it.
                await events.updateOne({ _id: event._id, leaseOwner: owner }, {
                    $set: { leaseUntil: new Date(0) }, $unset: { leaseOwner: '' },
                });
                result.failed++; continue;
            }
            result.sent++;
        } catch (error) {
            await events.updateOne({ _id: event._id, leaseOwner: owner }, {
                $set: { retryAt: new Date(Date.now() + 60_000), leaseUntil: new Date(0), lastError: error instanceof Error ? error.message : 'Meter event failed',
                    ...(error instanceof UsageDeliveryReviewError ? { pending: false, state: 'needs_review', processingStatus: 'needs_review', reviewReason: 'invoice_cutoff' } : {}) },
                $unset: { leaseOwner: '' },
            });
            result.failed++;
        }
    }
    return result;
}

export async function enqueueUsageEvent(
    input: Pick<UsageEvent, '_id' | 'authSubject' | 'customerId' | 'type' | 'value' | 'timestamp'> & Partial<Pick<UsageEvent, 'catalogVersion' | 'meterPriceId' | 'periodStart' | 'periodEnd' | 'state' | 'reviewReason' | 'usageTier' | 'eventName' | 'unitAmountMicros' | 'tariff'>>,
    db?: Db,
): Promise<void> {
    const events = (db || await getMongoDb()).collection<UsageEvent>(Collections.USAGE_EVENTS);
    const now = new Date();
    input = { ...input, catalogVersion: input.catalogVersion || 'legacy' };
    if (!Number.isSafeInteger(input.value) || input.value <= 0 || !Number.isSafeInteger(input.timestamp)) throw new Error('Usage quantities and timestamps must be positive safe integers.');
    if (input.tariff) {
        const contract = usageMeterContract({ ...input, catalogVersion: input.catalogVersion === 'legacy' ? undefined : input.catalogVersion });
        input = { ...input, catalogVersion: contract.catalogVersion, meterPriceId: contract.priceId, usageTier: contract.usageTier, eventName: contract.eventName };
    }
    if (input.type === 'transcription') {
        const fresh: UsageEvent = { ...input, reportedValue: 0, pending: !input.state || input.state === 'pending',
            catalogVersion: input.catalogVersion || 'legacy',
            ...(input.meterPriceId ? { meterPriceId: input.meterPriceId } : {}), state: input.state || 'pending', processingStatus: input.state === 'billed' ? 'processed' : input.state || 'pending',
            createdAt: now, updatedAt: now, retryAt: now, leaseUntil: new Date(0) };
        try { await events.insertOne(fresh); return; }
        catch (error) { if (!(error instanceof MongoServerError && error.code === 11000)) throw error; }
        const old = await events.findOne({ _id: input._id });
        if (!old || old.authSubject !== input.authSubject || old.type !== input.type || old.value !== input.value || old.customerId !== input.customerId || old.timestamp !== input.timestamp
            || old.catalogVersion !== input.catalogVersion || old.meterPriceId !== input.meterPriceId
            || old.usageTier !== input.usageTier || old.eventName !== input.eventName || old.unitAmountMicros !== input.unitAmountMicros
            || !isDeepStrictEqual(old.tariff, input.tariff)) throw new Error('An immutable transcription meter receipt cannot change.');
        return;
    }
    const previous = await events.findOne({ _id: input._id });
    if (previous && (previous.authSubject !== input.authSubject || previous.customerId !== input.customerId || previous.type !== input.type
        || previous.catalogVersion !== (input.catalogVersion || 'legacy') || previous.meterPriceId !== input.meterPriceId
        || previous.usageTier !== input.usageTier || previous.eventName !== input.eventName || previous.unitAmountMicros !== input.unitAmountMicros
        || !isDeepStrictEqual(previous.tariff, input.tariff))) throw new Error('A storage meter segment cannot change tariff or price.');
    const identity = { _id: input._id, authSubject: input.authSubject, customerId: input.customerId, type: input.type,
        catalogVersion: input.catalogVersion, meterPriceId: input.meterPriceId ?? { $exists: false },
        usageTier: input.usageTier ?? { $exists: false }, eventName: input.eventName ?? { $exists: false },
        unitAmountMicros: input.unitAmountMicros ?? { $exists: false }, tariff: input.tariff ?? { $exists: false } };
    const update = [
        { $set: {
            authSubject: input.authSubject,
            customerId: input.customerId,
            type: input.type,
            ...(!input.state ? {
                state: { $cond: [{ $gt: [input.value, { $ifNull: ['$value', 0] }] }, 'pending', { $ifNull: ['$state', 'pending'] }] },
                processingStatus: { $cond: [{ $gt: [input.value, { $ifNull: ['$value', 0] }] }, 'pending', { $ifNull: ['$processingStatus', 'pending'] }] },
                invoiceId: { $cond: [{ $gt: [input.value, { $ifNull: ['$value', 0] }] }, '$$REMOVE', '$invoiceId'] },
                billedAt: { $cond: [{ $gt: [input.value, { $ifNull: ['$value', 0] }] }, '$$REMOVE', '$billedAt'] },
            } : {}),
            catalogVersion: input.catalogVersion || 'legacy',
            ...(input.meterPriceId ? { meterPriceId: input.meterPriceId } : {}),
            ...(input.tariff ? { tariff: { $literal: input.tariff } } : {}),
            ...(input.usageTier ? { usageTier: input.usageTier, eventName: input.eventName } : {}),
            ...(input.unitAmountMicros !== undefined ? { unitAmountMicros: input.unitAmountMicros } : {}),
            ...(input.periodStart ? { periodStart: input.periodStart } : {}),
            ...(input.periodEnd ? { periodEnd: input.periodEnd } : {}),
            ...(input.state ? { state: input.state, processingStatus: input.state, reviewReason: input.reviewReason || null } : {}),
            value: { $max: [{ $ifNull: ['$value', 0] }, input.value] },
            reportedValue: { $ifNull: ['$reportedValue', 0] },
            timestamp: { $cond: [
                { $gt: [input.value, { $ifNull: ['$value', 0] }] },
                input.timestamp,
                { $ifNull: ['$timestamp', input.timestamp] },
            ] },
            createdAt: { $ifNull: ['$createdAt', now] },
            updatedAt: now,
            retryAt: { $ifNull: ['$retryAt', now] },
            leaseUntil: { $ifNull: ['$leaseUntil', new Date(0)] },
        } },
        { $set: { pending: { $gt: ['$value', '$reportedValue'] } } },
    ];
    try { await events.updateOne(identity, update, { upsert: true }); }
    catch (error) {
        if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
        // Identical concurrent inserts can race. The complete identity stays in
        // the write filter, so another tariff can never overwrite the winner.
        const retried = await events.updateOne(identity, update);
        if (!retried.matchedCount) throw new Error('A storage meter segment cannot change tariff or price.');
    }
}

/** Reconcile aggregate processing only after the complete local producer set has been submitted. */
export async function reconcileUsageProcessing(limit = 20, database?: Db, stripeOverride?: Stripe): Promise<number> {
    const db = database || await getMongoDb(), events = db.collection<UsageEvent>(Collections.USAGE_EVENTS);
    const candidates = await events.find({ processingStatus: 'accepted', tariff: { $exists: true } }).limit(limit).toArray();
    let confirmed = 0;
    for (const candidate of candidates) {
        const start = Math.floor((candidate.periodStart ? candidate.periodStart.getTime() / 1000 : candidate.timestamp) / 60) * 60;
        const end = Math.ceil(((candidate.periodEnd?.getTime() || Date.now()) / 1000) / 60) * 60;
        const rows = await events.find({ customerId: candidate.customerId, type: candidate.type,
            meterPriceId: candidate.meterPriceId || { $exists: false }, timestamp: { $gte: start, $lt: end } }).toArray();
        if (rows.some(row => row.pending || ['needs_review', 'rejected'].includes(row.processingStatus || ''))) continue;
        const user = await db.collection<User>(Collections.USERS).findOne({ authSubject: candidate.authSubject })
            || await db.collection<User>('billing_deleted_accounts').findOne({ authSubject: candidate.authSubject });
        const priceId = candidate.meterPriceId || (candidate.type === 'storage' ? user?.stripeMetering?.storagePriceId : user?.stripeMetering?.transcriptionPriceId);
        if (!priceId) continue;
        const stripe = stripeOverride || getStripe(), price = await stripe.prices.retrieve(priceId);
        const meter = price.recurring?.meter; if (!meter) continue;
        const contract = usageMeterContract(candidate);
        await assertArchivedUsageTariff(candidate.tariff!, db);
        for (const row of rows) {
            const accepted = usageMeterContract(row);
            if (accepted.eventName !== contract.eventName || accepted.meterId !== contract.meterId || accepted.unitPriceAtoms !== contract.unitPriceAtoms
                || accepted.quantityUnit !== contract.quantityUnit) throw new Error('One usage meter contains multiple tariff identities.');
            await assertArchivedUsageTariff(row.tariff!, db);
        }
        const actualMeter = await stripe.billing.meters.retrieve(meter);
        if (actualMeter.id !== contract.meterId || actualMeter.event_name !== contract.eventName
            || price.currency !== contract.currency || price.billing_scheme !== 'per_unit' || price.transform_quantity
            || parseUnitPriceAtoms(String(price.unit_amount_decimal ?? price.unit_amount)) !== contract.unitPriceAtoms) throw new Error('The processed usage price does not match its accepted tariff.');
        const summaries = await stripe.billing.meters.listEventSummaries(meter, { customer: candidate.customerId, start_time: start, end_time: end, limit: 100 });
        if (summaries.has_more) continue;
        const actual = summaries.data.reduce((sum, row) => sum + row.aggregated_value, 0);
        const expected = candidate.type === 'storage' ? Math.max(...rows.map(row => row.reportedValue), 0) : rows.reduce((sum, row) => sum + row.reportedValue, 0);
        if (actual !== expected) continue;
        for (const row of rows) {
            const result = await events.updateOne({ _id: row._id, reportedValue: row.reportedValue, pending: false, processingStatus: 'accepted' }, { $set: { processingStatus: 'processed' } });
            confirmed += result.modifiedCount;
        }
    }
    return confirmed;
}

export async function rejectMeterReceipt(identifier: string, reason: string, database?: Db) {
    const db = database || await getMongoDb();
    const separator = identifier.lastIndexOf(':');
    const id = separator > 0 ? identifier.slice(0, separator) : identifier;
    await db.collection<UsageEvent>(Collections.USAGE_EVENTS).updateOne({ _id: id }, { $set: { pending: false, state: 'rejected', processingStatus: 'rejected', reviewReason: reason } });
}

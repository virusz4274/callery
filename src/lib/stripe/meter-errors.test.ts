import test from 'node:test';
import assert from 'node:assert/strict';
import { Collections } from '@/lib/mongodb';
import { usageTariffFixture, archiveUsageTariffFixture } from './usage-test-support';
import { MemoryBillingDatabase } from './test-support';
import { fetchAndReconcileMeterNotification, reconcileMeterErrorReport, type MeterErrorEvent } from './meter-errors';

const timestamp = 1792497600;
const recurring = usageTariffFixture(), lifetime = usageTariffFixture('lifetime');
const meter = { id: recurring.transcription.meterId, event_name: recurring.transcription.eventName };
function event(identifiers = ['failed:4'], noMeter = false): MeterErrorEvent {
    return { type: noMeter ? 'v1.billing.meter.no_meter_found' : 'v1.billing.meter.error_report_triggered',
        related_object: { id: meter.id }, data: { validation_start: new Date((timestamp - 60) * 1000).toISOString(),
            validation_end: new Date((timestamp + 60) * 1000).toISOString(),
            reason: { error_count: identifiers.length + 1, error_types: [{ code: 'meter_event_invalid_value',
                sample_errors: identifiers.map(identifier => ({ request: { identifier } })) }] } },
    } as MeterErrorEvent;
}
async function database() {
    const db = new MemoryBillingDatabase();
    await archiveUsageTariffFixture(db.asDb(), recurring);
    await archiveUsageTariffFixture(db.asDb(), lifetime);
    for (const [_id, customerId, type, state, extra] of [
        ['failed', 'cus_a', 'transcription', 'accepted', {}],
        ['nearby', 'cus_a', 'transcription', 'accepted', {}],
        ['storage', 'cus_a', 'storage', 'accepted', {}],
        ['other_customer', 'cus_b', 'transcription', 'accepted', {}],
        ['billed', 'cus_a', 'transcription', 'billed', { invoiceId: 'in_paid', billedAt: new Date() }],
        ['old', 'cus_a', 'transcription', 'accepted', { timestamp: timestamp - 1000 }],
        ['later_peak', 'cus_a', 'storage', 'accepted', { value: 20, reportedValue: 20 }],
    ] as const) db.collection(Collections.USAGE_EVENTS).values.push({ _id, customerId, type, state, timestamp,
        value: 4, reportedValue: 4, pending: false, catalogVersion: recurring.storage.catalogVersion, tariff: recurring[type], meterPriceId: recurring[type].priceId, processingStatus: 'accepted', ...extra });
    return db;
}
function row(db: MemoryBillingDatabase, id: string) { return db.collection(Collections.USAGE_EVENTS).values.find(value => value._id === id)!; }

test('meter errors review only the authoritative meter and sampled customer, preserving settled and unrelated receipts', async () => {
    const db = await database();
    const report = await reconcileMeterErrorReport(event(['failed:4', 'billed:4']), db.asDb(), meter);
    assert.equal(row(db, 'failed').state, 'rejected');
    assert.equal(row(db, 'nearby').state, 'needs_review');
    for (const id of ['storage', 'other_customer', 'old']) assert.equal(row(db, id).state, 'accepted', id);
    assert.equal(row(db, 'billed').state, 'billed');
    assert.equal(report.unmatched, 1);
    assert.equal(report.unsampledErrors, 1);
    assert.equal(report.requiresReview, true, 'Unidentified failed events remain an explicit reconciliation task');
});

test('a no-meter report rejects exact samples without quarantining other customers or window receipts', async () => {
    const db = await database();
    await reconcileMeterErrorReport(event(['failed:4'], true), db.asDb());
    assert.equal(row(db, 'failed').state, 'rejected');
    for (const id of ['nearby', 'storage', 'other_customer', 'old']) assert.equal(row(db, id).state, 'accepted', id);
    assert.equal(row(db, 'billed').state, 'billed');
});

test('unrelated meters and stale storage delivery samples cannot rewrite newer successful or billed receipts', async () => {
    const db = await database();
    const report = await reconcileMeterErrorReport(event(['storage:4', 'later_peak:10']), db.asDb(), meter);
    assert.equal(report.rejected, 0);
    assert.equal(row(db, 'storage').state, 'accepted');
    assert.equal(row(db, 'later_peak').state, 'accepted');
    const stale = await reconcileMeterErrorReport(event(['later_peak:10'], true), db.asDb());
    assert.equal(stale.rejected, 0);
    assert.equal(row(db, 'later_peak').state, 'accepted');
    await assert.rejects(reconcileMeterErrorReport(event(), db.asDb(), { ...meter, id: 'mtr_other' }), /does not match/);
});

test('recurring meter errors cannot reject the same customer’s Lifetime tariff or another mapped price', async () => {
    const db = await database();
    db.collection(Collections.USAGE_EVENTS).values.push({ ...row(db, 'failed'), _id: 'lifetime', usageTier: 'lifetime', meterPriceId: lifetime.transcription.priceId, tariff: lifetime.transcription, catalogVersion: lifetime.transcription.catalogVersion });
    const other = usageTariffFixture('recurring', { catalogVersion: 'other-price-version', audioPriceId: 'price_other' });
    await archiveUsageTariffFixture(db.asDb(), other);
    db.collection(Collections.USAGE_EVENTS).values.push({ ...row(db, 'failed'), _id: 'other_price', tariff: other.transcription, catalogVersion: other.transcription.catalogVersion, meterPriceId: other.transcription.priceId });
    await reconcileMeterErrorReport(event(), db.asDb(), meter);
    assert.equal(row(db, 'failed').state, 'rejected');
    assert.equal(row(db, 'nearby').state, 'needs_review');
    assert.equal(row(db, 'lifetime').state, 'accepted');
    assert.equal(row(db, 'other_price').state, 'accepted');
});

test('plain Stripe fetchEvent data retrieves the authoritative meter by validated ID without a runtime helper', async () => {
    const db = await database(), calls: string[] = [];
    const authoritativeMeter = { id: 'mtr_owned', event_name: 'owned-diagnostic' };
    const related = { id: authoritativeMeter.id, type: 'billing.meter', url: '/do-not-follow-a-notification-url' };
    const raw = { ...event(['no-app-receipt:1']), id: 'evt_owned', context: null,
        related_object: related } as unknown as MeterErrorEvent;
    const report = await fetchAndReconcileMeterNotification({ id: raw.id, type: raw.type, fetchEvent: async () => raw }, db.asDb(), async id => {
        calls.push(id); return authoritativeMeter;
    });
    assert.deepEqual(calls, [authoritativeMeter.id]); assert.equal(report.unmatched, 1);
    assert.equal(report.rejected, 0); assert.equal(report.quarantined, 0);
    for (const invalid of [
        { ...raw, id: 'evt_other' }, { ...raw, context: 'acct_connect' },
        { ...raw, related_object: { ...related, type: 'customer' } },
    ]) await assert.rejects(fetchAndReconcileMeterNotification({ id: raw.id, type: raw.type, fetchEvent: async () => invalid as MeterErrorEvent },
        db.asDb(), async () => { throw new Error('Invalid reference must not fetch a meter.'); }));
    await assert.rejects(fetchAndReconcileMeterNotification({ id: raw.id, type: raw.type, fetchEvent: async () => raw },
        db.asDb(), async () => { throw new Error('Authoritative meter fetch failed.'); }), /Authoritative meter fetch failed/);
});

test('missing sample identifiers require review without inventing usage identities or quarantining accounts', async () => {
    const db = await database(), raw = event();
    raw.data.reason.error_count = 3;
    raw.data.reason.error_types[0].sample_errors = [
        { request: {} }, { request: { id: 'failed:4', idempotency_key: 'failed:4' } }, { request: { identifier: '' } },
    ] as unknown as typeof raw.data.reason.error_types[0]['sample_errors'];
    const report = await reconcileMeterErrorReport(raw, db.asDb(), meter);
    assert.deepEqual(report.sampledIdentifiers, []); assert.equal(report.missingIdentifiers, 3);
    assert.equal(report.unmatched, 3); assert.equal(report.rejected, 0); assert.equal(report.quarantined, 0);
    assert.equal(report.requiresReview, true);
    assert.equal(row(db, 'failed').state, 'accepted'); assert.equal(row(db, 'nearby').state, 'accepted');
});

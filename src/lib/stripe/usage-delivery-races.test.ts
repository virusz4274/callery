import test from 'node:test';
import assert from 'node:assert/strict';
import { Collections } from '@/lib/mongodb';
import { MemoryBillingDatabase } from './test-support';
import { archiveUsageTariffFixture, usageTariffFixture } from './usage-test-support';
import { reconcileMeterErrorReport, type MeterErrorEvent } from './meter-errors';
import { flushUsageEvents, type UsageEvent } from './usage-queue';

for (const sampled of [false, true]) test(`a delayed sender acknowledgment preserves ${sampled ? 'the exact rejected sample' : 'a nearby meter-error quarantine'}`, async () => {
    const database = new MemoryBillingDatabase(), db = database.asDb(), pair = usageTariffFixture();
    await archiveUsageTariffFixture(db, pair);
    const timestamp = Math.floor(Date.now() / 1000), rows = database.collection(Collections.USAGE_EVENTS);
    const sendingId = sampled ? 'sampled' : 'nearby';
    for (const _id of ['sampled', ...(!sampled ? ['nearby'] : [])]) rows.values.push({
        _id, authSubject: 'owner', customerId: 'cus_owner', type: 'transcription', value: 4,
        reportedValue: _id === sendingId ? 0 : 4, pending: _id === sendingId,
        state: _id === sendingId ? 'pending' : 'accepted', processingStatus: _id === sendingId ? 'pending' : 'accepted',
        timestamp, createdAt: new Date(), updatedAt: new Date(), retryAt: new Date(0), leaseUntil: new Date(0),
        delivery: { value: 4, timestamp }, catalogVersion: pair.transcription.catalogVersion,
        tariff: pair.transcription, meterPriceId: pair.transcription.priceId,
    });
    const event = { type: 'v1.billing.meter.error_report_triggered', related_object: { id: pair.transcription.meterId },
        data: { validation_start: new Date((timestamp - 60) * 1000).toISOString(),
            validation_end: new Date((timestamp + 60) * 1000).toISOString(),
            reason: { error_count: 2, error_types: [{ code: 'meter_event_invalid_value',
                sample_errors: [{ request: { identifier: 'sampled:4' } }] }] } },
    } as MeterErrorEvent;
    let sends = 0;
    const result = await flushUsageEvents(2, { db, send: async row => {
        sends++;
        assert.equal(row._id, sendingId);
        await reconcileMeterErrorReport(event, db, { id: pair.transcription.meterId, event_name: pair.transcription.eventName });
        // Stripe's request acknowledgment arrives after the asynchronous error report.
    } });
    const held = rows.values.find(row => row._id === sendingId)!;
    assert.equal(held.state, sampled ? 'rejected' : 'needs_review');
    assert.equal(held.processingStatus, held.state);
    assert.equal(held.reviewReason, sampled ? 'meter_event_invalid_value' : 'provider_meter_error_report');
    assert.equal(held.pending, false);
    assert.equal(held.reportedValue, 0);
    assert.deepEqual(held.delivery, { value: 4, timestamp }, 'The immutable delivery remains available for reconciliation');
    assert.equal(held.leaseOwner, undefined);
    assert.equal(sends, 1, 'A financial hold prevents another send');
    assert.deepEqual(result, { sent: 0, failed: 1 });
});

test('a delayed sender acknowledgment cannot reopen an already settled invoice receipt', async () => {
    const database = new MemoryBillingDatabase(), db = database.asDb(), pair = usageTariffFixture();
    await archiveUsageTariffFixture(db, pair);
    const timestamp = Math.floor(Date.now() / 1000), rows = database.collection(Collections.USAGE_EVENTS);
    rows.values.push({ _id: 'settled', authSubject: 'owner', customerId: 'cus_owner', type: 'transcription',
        value: 4, reportedValue: 0, pending: true, state: 'pending', processingStatus: 'pending', timestamp,
        createdAt: new Date(), retryAt: new Date(0), leaseUntil: new Date(0), delivery: { value: 4, timestamp },
        catalogVersion: pair.transcription.catalogVersion, tariff: pair.transcription, meterPriceId: pair.transcription.priceId });
    const billedAt = new Date();
    const result = await flushUsageEvents(1, { db, send: async () => {
        await db.collection<UsageEvent>(Collections.USAGE_EVENTS).updateOne({ _id: 'settled' }, { $set: {
            state: 'billed', processingStatus: 'processed', pending: false, invoiceId: 'in_settled', billedAt,
        } });
    } });
    const held = rows.values[0];
    assert.equal(held.state, 'billed'); assert.equal(held.processingStatus, 'processed');
    assert.equal(held.invoiceId, 'in_settled'); assert.deepEqual(held.billedAt, billedAt);
    assert.equal(held.pending, false); assert.equal(held.leaseOwner, undefined);
    assert.deepEqual(result, { sent: 0, failed: 1 });
});

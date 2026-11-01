import test from 'node:test';
import assert from 'node:assert/strict';
import { usageMeterContract } from './usage-meter';
import { enqueueUsageEvent } from './usage-queue';
import { MemoryBillingDatabase } from './test-support';
import { createUsageTariffSnapshot } from './usage-tariff';

function tariff() { return createUsageTariffSnapshot({ catalogVersion: 'archived-accepted-version', usageTier: 'lifetime', kind: 'transcription', priceId: 'price_lifetime', meterId: 'meter_lifetime',
    eventName: 'lifetime_weighted_audio', currency: 'usd', quantityUnit: 'weighted_15s_block', aggregation: 'sum', unitAmountDecimal: '0.123456789012', minimumChargeMicros: 0 }); }

test('the frozen usage contract preserves exact Stripe rates independently of current pricing', () => {
    const accepted = tariff(), contract = usageMeterContract({ type: 'transcription', tariff: accepted });
    assert.equal(contract.unitPriceAtoms, '123456789012');
    assert.equal(contract.catalogVersion, 'archived-accepted-version');
    assert.throws(() => usageMeterContract({ type: 'transcription' }), /snapshot/);
    assert.throws(() => usageMeterContract({ type: 'transcription', tariff: accepted, meterPriceId: 'changed' }), /changed/);
    assert.throws(() => usageMeterContract({ type: 'storage', tariff: accepted }), /changed/);
});
test('an accepted recording cannot change its tariff or price on replay', async () => {
    const memory = new MemoryBillingDatabase(), db = memory.asDb();
    const receipt = { _id: 'recording', authSubject: 'owner', customerId: 'cus_owner', type: 'transcription' as const,
        tariff: tariff(), value: 20, timestamp: 100 };
    await enqueueUsageEvent(receipt, db);
    await enqueueUsageEvent(receipt, db);
    const row = memory.collection('usage_events').values[0];
    assert.equal(row.meterPriceId, 'price_lifetime');
    assert.equal((row.tariff as ReturnType<typeof tariff>).quantityUnit, 'weighted_15s_block');
    await assert.rejects(enqueueUsageEvent({ ...receipt, tariff: { ...receipt.tariff, priceId: 'price_other' } }, db), /immutable/);
    assert.equal(memory.collection('usage_events').values.length, 1);
    assert.equal(row.value, 20);
});

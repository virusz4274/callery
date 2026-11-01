import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { MemoryBillingDatabase, userFixture } from './test-support';
import { usageTariffFixture, archiveUsageTariffFixture } from './usage-test-support';
import { reconcileUsageProcessing } from './usage-queue';

test('meter processing combines one price across archived catalogs while keeping Lifetime quantities separate', async () => {
    const memory = new MemoryBillingDatabase(), db = memory.asDb();
    memory.collection('users').values.push(userFixture() as unknown as Record<string, unknown>);
    const pairs = [usageTariffFixture('recurring', { catalogVersion: 'before-upgrade' }),
        usageTariffFixture('recurring', { catalogVersion: 'after-upgrade' }), usageTariffFixture('lifetime', { audioPrice: '0.123456789012' })];
    const quantities = [4, 16, 8];
    for (let index = 0; index < pairs.length; index++) {
        await archiveUsageTariffFixture(db, pairs[index]);
        const tariff = pairs[index].transcription;
        memory.collection('usage_events').values.push({ _id: String(index), authSubject: 'owner', customerId: 'cus_owner', type: 'transcription', tariff,
            catalogVersion: tariff.catalogVersion, meterPriceId: tariff.priceId, value: quantities[index], reportedValue: quantities[index], timestamp: 60,
            periodStart: new Date(0), periodEnd: new Date(120_000), pending: false, state: 'accepted', processingStatus: 'accepted' });
    }
    const stripe = { prices: { retrieve: async (id: string) => {
        const tariff = pairs.find(pair => pair.transcription.priceId === id)!.transcription;
        return { currency: 'usd', billing_scheme: 'per_unit', unit_amount_decimal: tariff.unitAmountDecimal, recurring: { meter: tariff.meterId } };
    } }, billing: { meters: { retrieve: async (id: string) => {
        const tariff = pairs.find(pair => pair.transcription.meterId === id)!.transcription;
        return { id, event_name: tariff.eventName };
    }, listEventSummaries: async (id: string) => ({ has_more: false, data: [{ aggregated_value: id === pairs[2].transcription.meterId ? 8 : 20 }] }) } } } as unknown as Stripe;
    assert.equal(await reconcileUsageProcessing(20, db, stripe), 3);
    assert.deepEqual(memory.collection('usage_events').values.map(row => row.processingStatus), ['processed', 'processed', 'processed']);
    assert.equal(await reconcileUsageProcessing(20, db, stripe), 0);
});

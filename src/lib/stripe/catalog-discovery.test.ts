import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { MemoryBillingDatabase } from './test-support';
import { CATALOG_DISCOVERY, markCatalogDiscoveryDirty, refreshCatalogDiscovery } from './catalog-discovery';

test('Stripe discovery refreshes a bounded draft cache without activating a financial catalog', async () => {
    const memory = new MemoryBillingDatabase(), db = memory.asDb();
    memory.collection(CATALOG_DISCOVERY).values.push({ _id: 'stripe', revision: 0 });
    let reads = 0;
    const stripe = { accounts: { retrieve: async () => ({ id: 'acct_owner' }) }, prices: { list: async function* () { reads++;
        yield { id: 'price_new', lookup_key: 'lifetime_audio', product: { id: 'prod_audio', name: 'Audio' }, unit_amount_decimal: '0.00206937', currency: 'usd', livemode: false, type: 'recurring', recurring: { interval: 'month', meter: 'mtr_audio' } };
    } } } as unknown as Stripe;
    assert.deepEqual(await refreshCatalogDiscovery({ db, stripe }), { refreshed: true, prices: 1 });
    assert.deepEqual(await refreshCatalogDiscovery({ db, stripe }), { refreshed: false });
    assert.equal(reads, 1);
    await markCatalogDiscoveryDirty('price_new', db);
    await refreshCatalogDiscovery({ db, stripe });
    assert.equal(reads, 2);
    assert.equal(memory.collection('billing_catalog_state').values.length, 0);
    const row = memory.collection(CATALOG_DISCOVERY).values[0];
    assert.equal(row.stripeAccountId, 'acct_owner');
    assert.equal((row.prices as { amountDecimal: string }[])[0].amountDecimal, '0.00206937');
    await markCatalogDiscoveryDirty('cus_not_a_catalog_object', db);
    assert.equal(row.revision, 1);
});

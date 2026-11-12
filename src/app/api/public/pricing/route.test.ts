import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicPricingHandler } from './handler';
import type { MarketingPricing } from '@/lib/marketing-pricing';

const fixture: MarketingPricing = { trial: null, plans: [{
    key: 'standard', name: 'Standard', description: 'An example public plan.', price: 12, currency: 'USD', interval: 'monthly',
    storageBytes: 1024, weightedMinutes: 60, usage: null,
    checkout: { stripePriceId: 'price_private_identifier', catalogVersion: 'private-catalog-version' },
}] };

test('pricing export contains only safe display fields and the configured app origin', async () => {
    const response = await createPublicPricingHandler({ enabled: () => true, load: async () => fixture,
        origin: () => 'https://app.example.com', now: () => new Date('2026-11-12T00:00:00Z') })();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const text = await response.text();
    assert.equal(text.includes('price_private_identifier'), false);
    assert.equal(text.includes('private-catalog-version'), false);
    const body = JSON.parse(text);
    assert.equal(body.pricing.plans[0].available, true);
    assert.equal(body.sourceAppOrigin, 'https://app.example.com');
});

test('self-host pricing export is disabled before any database read', async () => {
    const response = await createPublicPricingHandler({ enabled: () => false, load: async () => { throw new Error('Must not read'); },
        origin: () => { throw new Error('Must not resolve'); } })();
    assert.equal(response.status, 404);
});

test('failed or empty catalog exports never return a successful empty snapshot', async () => {
    for (const load of [async () => { throw new Error('Private database connection details'); }, async () => ({ trial: null, plans: [] })]) {
        const response = await createPublicPricingHandler({ enabled: () => true, load, origin: () => 'https://app.example.com' })();
        assert.equal(response.status, 503);
        assert.equal((await response.text()).includes('database'), false);
    }
});

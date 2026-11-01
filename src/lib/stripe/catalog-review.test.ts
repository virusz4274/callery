import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogReview } from './catalog-review';
import type { BillingCatalogBundle } from './catalog-bundle';
import { MemoryBillingDatabase, fixtureUsageTariffs, planFixture, userFixture } from './test-support';

function bundle(id: string, state: 'draft' | 'published', next = false): BillingCatalogBundle {
    const recurring = fixtureUsageTariffs('recurring', { storage: `price_${id}_storage`, transcription: `price_${id}_audio` }, id, { transcription: next ? '0.3' : '0.25' });
    const lifetime = fixtureUsageTariffs('lifetime', { storage: `price_${id}_life_storage`, transcription: `price_${id}_life_audio` }, id, { storage: next ? '0.002154123456' : '0.02' });
    return { _id: id, schemaVersion: 1, state, createdAt: new Date('2026-01-01'), stripeAccountId: 'acct_test', livemode: false,
        stripeObjects: { prices: [], meters: [] },
        plans: [planFixture(), planFixture({ key: 'pro', name: 'Pro', price: 20 }), planFixture({ key: 'lifetime', name: 'Lifetime', interval: 'lifetime' })]
            .map(plan => ({ plan, catalogVersion: `${id}:${plan.key}`, usageTariffs: plan.interval === 'lifetime' ? lifetime : recurring })) };
}
test('review reports exact rates, structural validation, affected owners and notices without writes', async () => {
    const memory = new MemoryBillingDatabase(), active = bundle('old', 'published'), draft = bundle('next', 'draft', true);
    memory.collection('billing_catalog_bundles').values.push(active as unknown as Record<string, unknown>, draft as unknown as Record<string, unknown>);
    memory.collection('billing_catalog_state').values.push({ _id: 'active', bundleId: 'old', revision: 1 });
    const owner = userFixture({ billingEntitlement: { source: 'subscription', grantedAt: new Date() }, stripeSubscriptionId: 'sub_owner', billingUsageTariffs: active.plans[0].usageTariffs });
    memory.collection('users').values.push(owner as unknown as Record<string, unknown>, userFixture({ authSubject: 'trial' }) as unknown as Record<string, unknown>);
    memory.collection('billing_usage_price_rollouts').values.push(
        { _id: 'scheduled', state: 'scheduled', targetBundleId: 'next', createdAt: new Date(), noticedAt: new Date(), emailSentAt: new Date(), effectiveAt: new Date('2099-01-01') },
        { _id: 'blocked', state: 'needs_review', targetBundleId: 'next', createdAt: new Date(), lastError: 'Funding transfer requires reconciliation.' },
        { _id: 'done', state: 'applied', targetBundleId: 'old', createdAt: new Date() });
    memory.collection('billing_catalog_discovery').values.push({ _id: 'stripe', revision: 2, refreshedRevision: 1, checkedAt: new Date(), prices: [{ id: 'price_discovered' }] });
    const before = JSON.stringify([...memory.collection('billing_catalog_bundles').values, ...memory.collection('users').values, ...memory.collection('billing_usage_price_rollouts').values]);
    const review = await buildCatalogReview(memory.asDb(), 'next');
    assert.equal(review.targetBundleId, 'next'); assert.equal(review.activeBundleId, 'old'); assert.equal(review.rates.length, 4);
    const audio = review.rates.find(row => row.tier === 'recurring' && row.kind === 'transcription')!;
    assert.equal(audio.previous!.centsPerUnit, '0.25'); assert.equal(audio.proposed.centsPerUnit, '0.3'); assert.equal(audio.proposed.minimumUsd, '0.012'); assert.equal(audio.increased, true);
    const storage = review.rates.find(row => row.tier === 'lifetime' && row.kind === 'storage')!;
    assert.equal(storage.proposed.usdPerGiB, '0.02154123456'); assert.equal(storage.increased, false);
    assert.equal(review.validation.passed, true);
    assert.ok(!JSON.stringify(review).includes('requiredMargin')); assert.equal(review.customers.affected, 1);
    assert.equal(review.rollouts.total, 3); assert.equal(review.rollouts.targetTotal, 2); assert.equal(review.rollouts.blocked, 1);
    assert.equal(review.rollouts.noticed, 1); assert.equal(review.rollouts.noticeMissing, 1); assert.equal(review.rollouts.earliestActivation, '2099-01-01T00:00:00.000Z');
    assert.equal(review.discovery.stale, true); assert.equal(review.discovery.priceCount, 1);
    assert.equal(JSON.stringify([...memory.collection('billing_catalog_bundles').values, ...memory.collection('users').values, ...memory.collection('billing_usage_price_rollouts').values]), before);
});
test('missing or expired cost configuration has no effect on review', async t => {
    const previous = process.env.MANAGED_COST_POLICY_JSON;
    t.after(() => { if (previous === undefined) delete process.env.MANAGED_COST_POLICY_JSON; else process.env.MANAGED_COST_POLICY_JSON = previous; });
    const memory = new MemoryBillingDatabase();
    memory.collection('billing_catalog_bundles').values.push(bundle('next', 'draft') as unknown as Record<string, unknown>);
    for (const value of [undefined, '{invalid', JSON.stringify({ expiresAt: '2020-01-01' })]) {
        if (value === undefined) delete process.env.MANAGED_COST_POLICY_JSON;
        else process.env.MANAGED_COST_POLICY_JSON = value;
        const review = await buildCatalogReview(memory.asDb(), 'next');
        assert.equal(review.validation.passed, true);
        assert.equal('margins' in review, false);
    }
});

test('positive fractional prices remain a business choice while invalid tariff structure is rejected', async () => {
    const memory = new MemoryBillingDatabase(), draft = bundle('business-rates', 'draft');
    draft.plans[2].usageTariffs = fixtureUsageTariffs('lifetime', undefined, draft._id, { transcription: '0.000000000001', storage: '0.000000000001' });
    memory.collection('billing_catalog_bundles').values.push(draft as unknown as Record<string, unknown>);
    assert.equal((await buildCatalogReview(memory.asDb(), draft._id)).validation.passed, true);
    draft.plans[2].usageTariffs.storage.usageTier = 'recurring';
    memory.collection('billing_catalog_bundles').values[0] = draft as unknown as Record<string, unknown>;
    const invalid = await buildCatalogReview(memory.asDb(), draft._id);
    assert.equal(invalid.validation.passed, false);
    assert.match(invalid.validation.errors.join(' '), /wrong plan family/);
});

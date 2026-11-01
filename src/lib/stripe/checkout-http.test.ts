import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { handleStripeCheckout } from './checkout-http';
import { MemoryBillingDatabase, planFixture, seedPublishedCatalogFixture, userFixture } from './test-support';

function setup(t: test.TestContext) {
    const previous = { billing: process.env.NEXT_PUBLIC_ENABLE_BILLING, origin: process.env.NEXT_PUBLIC_APP_URL };
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true'; process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
    t.after(() => {
        if (previous.billing === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING; else process.env.NEXT_PUBLIC_ENABLE_BILLING = previous.billing;
        if (previous.origin === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = previous.origin;
    });
    const memory = new MemoryBillingDatabase(), plan = planFixture({ stripePriceId: 'price_published' });
    seedPublishedCatalogFixture(memory, [plan], 'audited-costs', 'published-bundle');
    const calls: { price: string; version?: string; success: string; cancel: string }[] = [];
    const dependencies = { subject: async () => 'owner', profile: async () => userFixture(), database: async () => memory.asDb(),
        checkout: async (_subject: string, selected: typeof plan, urls: { success: string; cancel: string }) => {
            calls.push({ price: selected.stripePriceId, version: selected.billingCatalogVersion, ...urls });
            return 'https://checkout.stripe.test/session';
        } };
    const request = (body: unknown, origin = 'https://app.example.com') => new NextRequest('https://app.example.com/api/stripe/checkout', {
        method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return { memory, plan, calls, dependencies, request };
}

test('checkout HTTP sells the published offer without a mutable plan row and pins the displayed catalog', async t => {
    const { memory, plan, calls, dependencies, request } = setup(t);
    memory.collection('plans').values = [];
    const response = await handleStripeCheckout(request({ priceId: plan.stripePriceId, catalogVersion: plan.billingCatalogVersion,
        successUrl: 'https://attacker.example/return', cancelUrl: '/pricing?canceled=true' }), dependencies);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).url, 'https://checkout.stripe.test/session');
    assert.deepEqual(calls, [{ price: 'price_published', version: plan.billingCatalogVersion,
        success: 'https://app.example.com/settings?tab=billing&success=true', cancel: 'https://app.example.com/pricing?canceled=true' }]);
});

test('checkout HTTP ignores stale editable mappings and rejects mismatched or stale published selections', async t => {
    const { memory, plan, calls, dependencies, request } = setup(t);
    memory.collection('plans').values = [planFixture({ stripePriceId: 'price_stale' }) as unknown as Record<string, unknown>];
    assert.equal((await handleStripeCheckout(request({ priceId: 'price_published' }), dependencies)).status, 200);
    assert.equal((await handleStripeCheckout(request({ priceId: 'price_stale', planKey: plan.key }), dependencies)).status, 400);
    assert.equal((await handleStripeCheckout(request({ priceId: plan.stripePriceId, planKey: 'another-plan' }), dependencies)).status, 400);
    assert.equal((await handleStripeCheckout(request({ priceId: plan.stripePriceId, catalogVersion: 'previous-catalog' }), dependencies)).status, 409);
    memory.collection('billing_catalog_state').values[0].pausedPlanKeys = [plan.key];
    assert.equal((await handleStripeCheckout(request({ planKey: plan.key }), dependencies)).status, 400);
    assert.equal(calls.length, 1);
});

test('checkout HTTP blocks disabled billing, bad origins and unauthenticated requests before payment work', async t => {
    const { calls, dependencies, request } = setup(t);
    assert.equal((await handleStripeCheckout(request({ planKey: 'standard' }, 'https://attacker.example'), dependencies)).status, 403);
    assert.equal((await handleStripeCheckout(request({ planKey: 'standard' }), { ...dependencies, subject: async () => null })).status, 401);
    assert.equal((await handleStripeCheckout(request({}), dependencies)).status, 400);
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'false';
    assert.equal((await handleStripeCheckout(request({ planKey: 'standard' }), dependencies)).status, 403);
    assert.equal(calls.length, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFundingSource } from './funding-source';
import { userFixture } from './test-support';

test('funding follows authoritative entitlements and only Internal has uncapped owner funding', () => {
    for (const billingEntitlement of [undefined, { source: 'admin' as const, grantedAt: new Date() }]) {
        assert.equal(resolveFundingSource(userFixture({ planKey: 'internal', billingEntitlement, stripeCustomerId: undefined }), true), 'internal');
        assert.equal(resolveFundingSource(userFixture({ planKey: 'custom', billingEntitlement, stripeCustomerId: undefined }), true), 'grant');
    }
    for (const source of ['trial', 'subscription', 'lifetime'] as const) assert.equal(resolveFundingSource(userFixture({ planKey: 'internal', billingEntitlement: { source, grantedAt: new Date() } }), true), source === 'trial' ? 'trial' : 'customer');
    for (const patch of [{ planKey: 'pro' }, { planKey: 'internal', stripeSubscriptionId: 'sub_unknown' }, { planKey: 'custom', stripeSubscriptionStatus: 'canceled' as const }]) {
        assert.equal(resolveFundingSource(userFixture({ role: 'admin', billingEntitlement: undefined, ...patch }), true), undefined);
    }
    assert.equal(resolveFundingSource(userFixture({ billingEntitlement: undefined, planKey: 'pro' }), false), 'selfhost');
});

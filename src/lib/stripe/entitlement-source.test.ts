import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveBillingEntitlementSource } from './entitlement-source';
import type { BillingEntitlement } from './billing-types';

test('legacy Internal and Custom without a subscription retain their administrator entitlement', () => {
    for (const planKey of ['internal', 'custom']) {
        assert.equal(effectiveBillingEntitlementSource({ planKey }), 'admin');
        // Provisioning a customer alone never purchases a subscription.
        const provisioned = { planKey, stripeCustomerId: 'cus_without_subscription' };
        assert.equal(effectiveBillingEntitlementSource(provisioned), 'admin');
        assert.equal(effectiveBillingEntitlementSource({ planKey, stripeSubscriptionId: '', stripeSubscriptionStatus: '' }), 'admin');
    }
});

test('explicit entitlements remain authoritative for every plan and subscription status', () => {
    for (const source of ['trial', 'admin', 'subscription', 'lifetime'] as const) {
        const billingEntitlement: BillingEntitlement = { source, grantedAt: new Date() };
        for (const planKey of ['internal', 'custom', 'standard']) {
            assert.equal(effectiveBillingEntitlementSource({ planKey, billingEntitlement, stripeSubscriptionId: 'sub_existing', stripeSubscriptionStatus: 'past_due' }), source);
        }
    }
});

test('unknown paid plans and subscription-linked legacy plans never imply a free grant', () => {
    for (const planKey of ['standard', 'pro', 'lifetime', 'free-trial', 'other', undefined]) {
        assert.equal(effectiveBillingEntitlementSource({ planKey }), undefined);
    }
    for (const planKey of ['internal', 'custom']) {
        for (const patch of [{ stripeSubscriptionId: 'sub_existing' }, { stripeSubscriptionStatus: 'active' }, { stripeSubscriptionStatus: 'canceled' }]) {
            assert.equal(effectiveBillingEntitlementSource({ planKey, ...patch }), undefined);
        }
    }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { toUserResponse } from '@/lib/db/converters';
import { userFixture } from '@/lib/stripe/test-support';
import type { User } from '@/lib/db/types';
import { CurrentPlanCard } from './current-plan-card';
import { BillingSettings } from '../billing-settings';
import { ToastProvider } from '@/components/toast-provider';

function profile(patch: Partial<User> = {}) {
    return toUserResponse(userFixture({ planKey: 'internal', billingEntitlement: undefined,
        stripeCustomerId: undefined, stripeSubscriptionId: undefined, stripeSubscriptionStatus: undefined,
        googleSync: { status: 'not_connected' },
        notificationSettings: { activityDigest: 'weekly' },
        ...patch }), 'Internal');
}

function renderPlan(user: ReturnType<typeof profile>) {
    const noop = () => {};
    return renderToStaticMarkup(createElement(CurrentPlanCard, {
        planName: user.planName, isFree: false, isTrial: false,
        operatorFunded: user.billingStatus?.entitlement === 'admin',
        canManageSubscription: Boolean(user.billingStatus?.canManageBilling),
        needsBillingAttention: user.billingStatus?.needsAttention,
        allowOverage: false, storageUsed: 1, storageAlloc: 100, storagePercent: 1,
        transcribeUsed: 1, transcribeAlloc: 100, transcribePercent: 1,
        transcriptionUnlimited: user.transcriptionUnlimited,
        isLoadingPortal: false, isLoadingPlans: false, isCheckingOut: false, isTogglingRules: false,
        availablePlans: [], onPortal: noop, onUpgradeOpen: noop, onCheckout: noop, onToggleOverage: noop,
    }));
}

test('legacy Internal displays unlimited transcription without Stripe purchase controls', t => {
    const before = process.env.NEXT_PUBLIC_ENABLE_BILLING;
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
    t.after(() => { if (before === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING; else process.env.NEXT_PUBLIC_ENABLE_BILLING = before; });
    for (const stripeCustomerId of [undefined, 'cus_customer_only']) {
        const user = profile({ stripeCustomerId });
        assert.equal(user.billingStatus?.entitlement, 'admin');
        assert.equal(user.billingStatus?.needsAttention, false);
        assert.equal(user.billingStatus?.canManageBilling, false, 'A customer record alone is not an existing Stripe contract');
        const markup = renderPlan(user);
        assert.match(markup, /Administrator funded/);
        assert.equal(user.transcriptionUnlimited, true);
        assert.match(markup, /no minute quota/);
        assert.match(markup, /Unlimited/);
        assert.doesNotMatch(markup, /Pay per usage|Choose a plan|Payments &amp; invoices|Allow pay per usage/);
    }
});

test('Custom administrator grants retain finite quotas without a monetary processing budget', () => {
    const user = profile({ planKey: 'custom', billingEntitlement: { source: 'admin', grantedAt: new Date() } });
    assert.equal(user.transcriptionUnlimited, false);
    assert.doesNotMatch(renderPlan(user), /operator budget|spending cap|cost budget/);
    assert.match(renderPlan(user), /assigned quotas/);
    assert.doesNotMatch(renderPlan(user), /Unlimited/);
});

test('Internal financial review remains visible and blocks new work', t => {
    const before = process.env.NEXT_PUBLIC_ENABLE_BILLING;
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
    t.after(() => { if (before === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING; else process.env.NEXT_PUBLIC_ENABLE_BILLING = before; });
    const user = profile({ billingReview: { reason: 'payment_dispute', createdAt: new Date() } });
    assert.equal(user.billingStatus?.entitlement, 'review');
    assert.equal(user.billingStatus?.needsAttention, true);
    assert.match(renderPlan(user), /Billing needs attention/);
});

test('an explicit administrator grant retains management of its actual old Stripe contract without offering paid overage', () => {
    const user = profile({ billingEntitlement: { source: 'admin', grantedAt: new Date() },
        stripeCustomerId: 'cus_existing', stripeSubscriptionId: 'sub_existing', stripeSubscriptionStatus: 'active' });
    assert.equal(user.billingStatus?.entitlement, 'admin');
    assert.equal(user.billingStatus?.canManageBilling, true);
    const markup = renderPlan(user);
    assert.match(markup, /Payments &amp; invoices/);
    assert.doesNotMatch(markup, /Pay per usage|Choose a plan|Allow pay per usage/);
    const settings = renderToStaticMarkup(createElement(ToastProvider, null,
        createElement(BillingSettings, { userProfile: user })));
    assert.match(settings, /Payments &amp; invoices/);
    assert.doesNotMatch(settings, /Prepaid usage credit|Add usage credit|Automatic top-up settings/);
});

test('a Stripe-linked Internal account with no explicit entitlement remains in review', t => {
    const before = process.env.NEXT_PUBLIC_ENABLE_BILLING;
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
    t.after(() => { if (before === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING; else process.env.NEXT_PUBLIC_ENABLE_BILLING = before; });
    for (const patch of [{ stripeSubscriptionId: 'sub_unknown' }, { stripeSubscriptionStatus: 'active' as const }]) {
        const user = profile(patch);
        assert.equal(user.billingStatus?.entitlement, 'review');
        assert.equal(user.billingStatus?.needsAttention, true);
        assert.match(renderPlan(user), /Billing needs attention/);
        assert.doesNotMatch(renderPlan(user), /Administrator funded/);
    }
});

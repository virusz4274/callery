import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type Stripe from 'stripe';
import { hasBillingIssue } from '@/lib/access-control-common';
import { FakeBillingStripe, MemoryBillingDatabase, planFixture, seedPublishedCatalogFixture, userFixture } from './test-support';
import { getBillingAccount, mutateBillingAccount, reserveCost } from './ledger';
import { hasUnpaidService, processBillingRecovery } from './recovery';
import { sourcePlanUsableWhileAwaitingPayment, type BillingOperationSummary } from './billing-types';
import { syncSubscription } from './sync';

function operation(state: BillingOperationSummary['state'] = 'awaiting_payment', sourcePlanUsable = true): BillingOperationSummary {
    return { id: 'upgrade', state, sourcePlanUsable, kind: 'plan_change', targetPlanKey: 'pro', amountDueMinor: 1000, currency: 'usd', createdAt: new Date(), updatedAt: new Date(), invoiceId: 'in_upgrade' };
}
function fixture(t: test.TestContext, summary = operation()) {
    const names = ['NEXT_PUBLIC_ENABLE_BILLING', 'STRIPE_SECRET_KEY', 'MANAGED_COST_POLICY_JSON'];
    const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
    t.after(() => { for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; });
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true'; process.env.STRIPE_SECRET_KEY = 'sk_test_fixture';
    const policy = JSON.parse(readFileSync(new URL('./__fixtures__/legacy-cost-policy.json', import.meta.url), 'utf8'));
    Object.assign(policy, { version: 'source-plan-payment-test', reviewedAt: '2020-01-01', expiresAt: '2099-01-01', paymentFeeBasisPoints: 0, paymentFixedMicros: 0, stripeBillingFeeBasisPoints: 0, stripeBillingFixedMicros: 0 });
    process.env.MANAGED_COST_POLICY_JSON = JSON.stringify(policy);
    const memory = new MemoryBillingDatabase(), stripe = new FakeBillingStripe();
    seedPublishedCatalogFixture(memory, [planFixture(), planFixture({ key: 'lifetime', interval: 'lifetime', stripePriceId: 'price_lifetime' })], policy.version);
    const subscription = stripe.subscription('sub_owner', 'active', { authSubject: 'owner' });
    subscription.items.data.unshift({ id: 'si_base', price: stripe.priceValues.get('price_base')!, current_period_start: 1790812800, current_period_end: 1793491200 } as Stripe.SubscriptionItem);
    stripe.subscriptionValues.push(subscription);
    const user = userFixture({ planKey: 'standard', billingOperation: summary, storageUsed: 0, transcriptionUsed: 0, stripePriceId: 'price_base', stripeSubscriptionId: subscription.id,
        stripeSubscriptionStatus: 'active', stripeCurrentPeriodStart: new Date(1790812800000), stripeCurrentPeriodEnd: new Date(1793491200000),
        billingEntitlement: { source: 'subscription', reference: subscription.id, grantedAt: new Date() },
        stripeMetering: { subscriptionId: subscription.id, storagePriceId: 'price_storage', transcriptionPriceId: 'price_transcription', verifiedAt: new Date() } });
    const account = getBillingAccount(user);
    account.prepaidFundedMicros = 5_000_000;
    account.fundingLots.prepaid = { id: 'prepaid', kind: 'prepaid', source: 'stripe', reference: 'cg', amountMicros: 5_000_000, creditedMicros: 0, costMicros: 0, reservedCostMicros: 0, processorFeeMicros: 0, createdAt: new Date() };
    account.fundingLots.base = { id: 'base', kind: 'base', source: 'stripe', reference: 'in_base', amountMicros: 10_000_000, creditedMicros: 0, costMicros: 0, reservedCostMicros: 0, createdAt: new Date() };
    user.billingAccount = account;
    memory.collection('users').values.push(user as never);
    return { memory, stripe, subscription, runtime: { db: memory.asDb(), stripe: stripe.asStripe() } };
}
function reserveSourceWork(value: ReturnType<typeof fixture>) {
    const user = value.memory.user();
    return reserveCost(getBillingAccount(user), user, { id: 'work', kind: 'transcription', retailMicros: 10_000, maximumCostMicros: 100, expiresAt: new Date(),
        paymentFeeSchedule: { costPolicyVersion: 'test', costPolicyFingerprint: 'test', expiresAt: '2099-01-01', paymentFeeBasisPoints: 0, paymentFixedMicros: 0, minimumTopupMicros: 5_000_000 } });
}

test('only a verified awaiting-payment operation leaves the original plan usable', t => {
    const value = fixture(t);
    assert.equal(sourcePlanUsableWhileAwaitingPayment(value.memory.user()), true);
    assert.equal(hasBillingIssue(value.memory.user()), null);
    assert.equal(reserveSourceWork(value).state, 'reserved');
    for (const summary of [operation('awaiting_payment', false), operation('draining'), operation('applying'), operation('needs_review')]) {
        value.memory.user().billingOperation = summary;
        assert.equal(sourcePlanUsableWhileAwaitingPayment(value.memory.user()), false);
        assert.equal(hasBillingIssue(value.memory.user())?.allowed, false);
        assert.throws(() => reserveSourceWork(value), /spending is paused/);
    }
});

test('voluntary upgrade payment cannot override real debt or terminal service status', t => {
    const value = fixture(t);
    value.memory.user().stripePaymentIssues = { in_existing: { state: 'failed', subscriptionId: 'sub_old', updatedAt: new Date() } };
    assert.equal(hasBillingIssue(value.memory.user())?.allowed, false);
    assert.equal(hasUnpaidService(value.memory.user()), true);
    assert.throws(() => reserveSourceWork(value), /spending is paused/);
    delete value.memory.user().stripePaymentIssues;
    value.memory.user().stripeSubscriptionStatus = 'canceled';
    assert.equal(hasBillingIssue(value.memory.user())?.allowed, false);
    assert.equal(hasUnpaidService(value.memory.user()), true);
    assert.throws(() => reserveSourceWork(value), /spending is paused/);
});

test('confirmed payment moves to draining before a concurrent source reservation can commit', async t => {
    const value = fixture(t);
    let changed = false;
    await assert.rejects(mutateBillingAccount('owner', (account, user) => {
        reserveCost(account, user, { id: 'work', kind: 'transcription', retailMicros: 10_000, maximumCostMicros: 100, expiresAt: new Date(),
            paymentFeeSchedule: { costPolicyVersion: 'test', costPolicyFingerprint: 'test', expiresAt: '2099-01-01', paymentFeeBasisPoints: 0, paymentFixedMicros: 0, minimumTopupMicros: 5_000_000 } });
        if (!changed) { changed = true; value.memory.user().billingOperation = operation('draining', false); }
    }, value.runtime.db), /spending is paused/);
    assert.equal(Object.keys(value.memory.user().billingAccount!.reservations).length, 0);
});

test('subscription synchronization retains the original proof and can maintain its funded usage window', async t => {
    const value = fixture(t), before = value.memory.user();
    const originalPlan = before.planKey, originalAllowance = before.transcriptionAllocation;
    await syncSubscription('sub_owner', value.runtime);
    assert.equal(value.memory.user().planKey, originalPlan);
    assert.equal(value.memory.user().transcriptionAllocation, originalAllowance);
    assert.equal(value.memory.user().stripeMetering?.storagePriceId, 'price_storage');
    assert.equal(value.memory.user().stripeMetering?.transcriptionPriceId, 'price_transcription');
    assert.ok(value.memory.user().billingAccount!.currentPeriodId);
    assert.equal(hasBillingIssue(value.memory.user()), null);
});

test('draining preserves source meter proof while blocking new work and monthly admission', async t => {
    const value = fixture(t, operation('draining'));
    await syncSubscription('sub_owner', value.runtime);
    assert.ok(value.memory.user().stripeMetering);
    assert.equal(value.memory.user().billingAccount!.currentPeriodId, undefined);
    assert.equal(hasBillingIssue(value.memory.user())?.allowed, false);
});

test('a voluntary unpaid upgrade does not start recovery; an existing unpaid service still does', async t => {
    const value = fixture(t);
    assert.equal(hasUnpaidService(value.memory.user()), false);
    const result = await processBillingRecovery(value.runtime.db, 20, async () => { throw new Error('No purge authorized'); });
    assert.equal(result.started, 0); assert.equal(result.failed, 0); assert.equal(value.memory.user().billingRecovery, undefined);
    value.memory.user().billingOperation = operation('awaiting_payment', false);
    assert.equal(hasUnpaidService(value.memory.user()), true);
});

test('out-of-band source meter changes block work without activating the unpaid target plan', async t => {
    const value = fixture(t);
    value.subscription.items.data.find(item => item.id === 'si_storage')!.price = value.stripe.priceValues.get('price_lifetime_storage')!;
    await syncSubscription('sub_owner', value.runtime);
    assert.equal(value.memory.user().planKey, 'standard');
    assert.ok(value.memory.user().billingReview);
    assert.equal(hasBillingIssue(value.memory.user())?.allowed, false);
});

import { testProcessingCostEvidence } from './processing-test-support';
import assert from 'node:assert/strict';
import test from 'node:test';
import type Stripe from 'stripe';
import { checkoutParams } from './checkout';
import { createUsageTopup, PREPAID_TOPUPS, reconcileAutomaticTopup, type PrepaidTopup } from './prepaid-topup';
import { clone, FakeBillingStripe, MemoryBillingDatabase, planFixture, seedPublishedCatalogFixture, userFixture } from './test-support';

function page<T>(data: T[]) {
    return Object.assign(Promise.resolve({ data: clone(data), has_more: false }), { async *[Symbol.asyncIterator]() { yield* clone(data); } });
}
function fixture(t: test.TestContext) {
    const previous = { billing: process.env.NEXT_PUBLIC_ENABLE_BILLING, policy: process.env.MANAGED_COST_POLICY_JSON };
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
    process.env.MANAGED_COST_POLICY_JSON = JSON.stringify({ version: 'address-test-fixture', reviewedAt: '2020-01-01', expiresAt: '2099-01-01',
        paymentFeeBasisPoints: 0, paymentFixedMicros: 0, stripeBillingFeeBasisPoints: 0, stripeBillingFixedMicros: 0, minimumTopupMicros: 5_000_000,
        infrastructureMicrosPerAudioMinute: 0, infrastructureMicrosPerGiB: 0, aiBundleMicrosPerAudioMinute: 0, aiBundleFixedMicros: 0,
        storageCostMicrosPerGiBMonth: 100, storageOperationsMicrosPerGiBMonth: 0, recoveryReserveMicros: 1, lifetimeHostingReserveMicros: 1,
        lifetimeUsage: { audioOverheadMicrosPerMinute: 0, recordingOverheadMicros: 0, storageOverheadMicrosPerGiBMonth: 0 },
        providers: { soniox: { costMicrosPerAudioMinute: 100, fixedMicros: 0 }, gemini: { costMicrosPerAudioMinute: 100, fixedMicros: 0 }, elevenlabs: { costMicrosPerAudioMinute: 100, fixedMicros: 0 } },
        ...testProcessingCostEvidence(), exports: { fixedMicros: 0, perGiBMicros: 0, maximumSourceBytes: 1_000_000, recoveryReserveMicros: 1 } });
    t.after(() => {
        if (previous.billing === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING; else process.env.NEXT_PUBLIC_ENABLE_BILLING = previous.billing;
        if (previous.policy === undefined) delete process.env.MANAGED_COST_POLICY_JSON; else process.env.MANAGED_COST_POLICY_JSON = previous.policy;
    });
    const database = new MemoryBillingDatabase(), stripe = new FakeBillingStripe();
    seedPublishedCatalogFixture(database, [planFixture(), planFixture({ key: 'pro', stripePriceId: 'price_pro' }), planFixture({ key: 'lifetime', interval: 'lifetime', stripePriceId: 'price_lifetime' })], 'address-test-fixture');
    const subscription = stripe.subscription('sub_active', 'active', { authSubject: 'owner' });
    stripe.subscriptionValues.push(subscription);
    database.collection('users').values.push(userFixture({ planKey: 'standard', stripeSubscriptionId: subscription.id, stripeSubscriptionStatus: 'active',
        billingEntitlement: { source: 'subscription', reference: subscription.id, grantedAt: new Date() },
        stripeMetering: { subscriptionId: subscription.id, storagePriceId: 'price_storage', transcriptionPriceId: 'price_transcription', verifiedAt: new Date() },
        automaticTopup: { enabled: true, amountMinor: 500, thresholdMinor: 500, dailyCapMinor: 1000, monthlyCapMinor: 5000, consentedAt: new Date(), updatedAt: new Date() },
    }) as unknown as Record<string, unknown>);
    Object.assign(stripe.checkout.sessions, { list: () => page([...stripe.sessions.values()]) });
    return { database, stripe, dependencies: { db: database.asDb(), stripe: stripe.asStripe() } };
}

test('subscription and Lifetime Checkout persist customer-provided billing details for later invoices', () => {
    for (const plan of [planFixture(), planFixture({ key: 'lifetime', interval: 'lifetime', stripePriceId: 'price_lifetime' })]) {
        const params = checkoutParams(userFixture(), plan, 'cus_existing', 'attempt', { success: 'https://app.example/success', cancel: 'https://app.example/cancel' }, new Date());
        assert.equal(params.billing_address_collection, 'required');
        assert.deepEqual(params.customer_update, { address: 'auto', name: 'auto' });
        assert.equal(params.customer, 'cus_existing');
        assert.equal(params.line_items?.[0].price, plan.stripePriceId);
        if (plan.interval === 'lifetime') assert.match(params.payment_intent_data?.description || '', /Lifetime platform access/);
    }
});

test('new prepaid Checkout journals mandatory billing details and service description without crediting unpaid funds', async t => {
    const { database, dependencies } = fixture(t);
    const result = await createUsageTopup('owner', 500, { success: 'https://app.example/success', cancel: 'https://app.example/cancel' }, dependencies);
    const attempt = database.collection(PREPAID_TOPUPS).values.find(row => row._id === result.attemptId) as unknown as PrepaidTopup;
    assert.equal(attempt.checkoutParams?.billing_address_collection, 'required');
    assert.deepEqual(attempt.checkoutParams?.customer_update, { address: 'auto', name: 'auto' });
    assert.match(attempt.checkoutParams?.payment_intent_data?.description || '', /prepaid storage and transcription usage credit/);
    assert.equal(attempt.amountMinor, 500); assert.equal(attempt.state, 'open');
    assert.equal(database.user().billingAccount?.prepaidFundedMicros || 0, 0);
});

test('automatic top-up sends its service description with the unchanged consented amount and idempotency key', async t => {
    const { database, stripe, dependencies } = fixture(t);
    const calls: { params: Stripe.PaymentIntentCreateParams; idempotencyKey: string }[] = [];
    Object.assign(stripe.paymentIntents, { list: () => page([]), create: async (params: Stripe.PaymentIntentCreateParams, options: { idempotencyKey: string }) => {
        calls.push({ params, idempotencyKey: options.idempotencyKey });
        return { id: 'pi_requires_payment', status: 'requires_payment_method' };
    } });
    await reconcileAutomaticTopup('owner', dependencies);
    assert.equal(calls.length, 1);
    assert.match(calls[0].params.description || '', /automatic prepaid storage and transcription usage credit/);
    assert.equal(calls[0].params.amount, 500); assert.equal(calls[0].params.customer, 'cus_owner');
    assert.equal(calls[0].params.confirm, true); assert.equal(calls[0].params.off_session, true);
    const attempt = database.collection(PREPAID_TOPUPS).values[0] as unknown as PrepaidTopup;
    assert.equal(calls[0].idempotencyKey, `automatic-usage-topup:${attempt._id}`);
    assert.deepEqual(attempt.paymentParams, calls[0].params);
    assert.equal(attempt.state, 'needs_review'); assert.equal(database.user().billingAccount?.prepaidFundedMicros || 0, 0);
});

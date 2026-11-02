import { testProcessingCostEvidence } from './processing-test-support';
import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { readFileSync } from 'node:fs';
import { clone, FakeBillingStripe, MemoryBillingDatabase, planFixture, seedPublishedCatalogFixture, userFixture } from './test-support';
import { TransferStripe, transferFixture } from './grant-transfer.test-support';
import { ensureUsageGrantScope } from './grant-transfer';
import { withBillingLease } from './billing-lock';
import { getPrepaidState } from './ledger';
import { PREPAID_TOPUPS, reconcileAutomaticTopup, reconcileUsageTopups, type PrepaidTopup } from './prepaid-topup';

function fixture() {
    const value = transferFixture();
    const charge = { id: 'ch_paid', customer: 'cus_owner', payment_intent: 'pi_paid', amount: 500, amount_refunded: 0,
        currency: 'usd', paid: true, refunded: false, disputed: false } as Stripe.Charge;
    const payment = { id: 'pi_paid', customer: 'cus_owner', status: 'succeeded', amount_received: 500, currency: 'usd', latest_charge: 'ch_paid' } as Stripe.PaymentIntent;
    let reads = 0, unavailable = false;
    Object.assign(value.stripe, {
        paymentIntents: { retrieve: async () => { reads++; if (unavailable) throw new Error('Temporary Stripe outage'); return clone(payment); } },
        charges: { retrieve: async () => clone(charge) },
    });
    const attempt: PrepaidTopup = { _id: 'topup_original', authSubject: 'owner', customerId: 'cus_owner', amountMinor: 500, currency: 'usd', kind: 'checkout',
        state: 'complete', meterPriceIds: { storage: 'price_old_storage', transcription: 'price_old_transcription' }, createdAt: new Date(), updatedAt: new Date(),
        paymentIntentId: payment.id, creditGrantId: 'cg_original' };
    value.memory.collection(PREPAID_TOPUPS).values.push(attempt as unknown as Record<string, unknown>);
    return { ...value, charge, payment, reads: () => reads, setUnavailable: (next: boolean) => { unavailable = next; },
        attempt: () => value.memory.collection(PREPAID_TOPUPS).values[0] as unknown as PrepaidTopup };
}

for (const reversal of ['refund', 'partial_refund', 'dispute'] as const) test(`completed prepaid receipt reconciliation recovers a missed ${reversal} webhook`, async () => {
    const value = fixture();
    if (reversal === 'dispute') value.charge.disputed = true;
    else value.charge.amount_refunded = reversal === 'refund' ? 500 : 1;
    await reconcileUsageTopups(20, value.runtime);
    assert.ok(value.memory.user().billingReview);
    assert.equal(getPrepaidState(value.memory.user()).availableMicros, 0);
    assert.equal(value.attempt().state, 'needs_review');
    assert.ok(value.attempt().fundingCheckedAt);
    assert.equal(value.stripe.expireCalls, 1);
    await reconcileUsageTopups(20, value.runtime);
    assert.equal(value.stripe.expireCalls, 1);
});

for (const change of ['void', 'expiry'] as const) test(`completed prepaid receipt reconciliation recovers a missed grant ${change} webhook`, async () => {
    const value = fixture(), grant = value.stripe.grants.get('cg_original')!;
    if (change === 'void') grant.voided_at = Math.floor(Date.now() / 1000);
    else grant.expires_at = Math.floor(Date.now() / 1000);
    await reconcileUsageTopups(20, value.runtime);
    assert.equal(getPrepaidState(value.memory.user()).availableMicros, 0);
    assert.ok(value.memory.user().billingReview);
    assert.equal(value.attempt().state, 'needs_review');
});

test('completed receipt polling accepts planned ancestor expiry and watches the active replacement', async () => {
    const value = fixture();
    await withBillingLease(value.runtime.db, 'owner', user => ensureUsageGrantScope(user, ['price_new_storage', 'price_new_transcription'], value.runtime));
    assert.equal(value.stripe.expireCalls, 1);
    await reconcileUsageTopups(20, value.runtime);
    assert.equal(value.attempt().state, 'complete');
    assert.equal(value.attempt().fundingLastError, undefined);
    assert.equal(getPrepaidState(value.memory.user()).availableMicros, 4_000_000);
    assert.equal(value.memory.user().billingReview, undefined);
    value.stripe.grants.get('cg_replacement_1')!.voided_at = Math.floor(Date.now() / 1000);
    await reconcileUsageTopups(20, value.runtime);
    assert.equal(value.attempt().state, 'needs_review');
    assert.equal(getPrepaidState(value.memory.user()).availableMicros, 0);
});

test('uncertain reads and foreign payment identities never revoke or mint prepaid principal', async () => {
    const value = fixture();
    value.setUnavailable(true);
    await reconcileUsageTopups(20, value.runtime);
    assert.match(value.attempt().fundingLastError!, /outage/);
    assert.ok(value.attempt().fundingCheckedAt);
    assert.equal(getPrepaidState(value.memory.user()).availableMicros, 4_000_000);
    value.setUnavailable(false); value.charge.customer = 'cus_other';
    await reconcileUsageTopups(20, value.runtime);
    assert.match(value.attempt().fundingLastError!, /identity/);
    assert.equal(getPrepaidState(value.memory.user()).availableMicros, 4_000_000);
    assert.equal(value.stripe.expireCalls, 0);
});

test('a completed receipt sweep obeys its bounded batch size', async () => {
    const value = fixture();
    value.memory.collection(PREPAID_TOPUPS).values.push({ ...value.attempt(), _id: 'topup_later' });
    await reconcileUsageTopups(1, value.runtime);
    assert.equal(value.reads(), 1);
    assert.ok(value.attempt().fundingCheckedAt);
    assert.equal(value.memory.collection(PREPAID_TOPUPS).values[1].fundingCheckedAt, undefined);
});

function automaticSettings(value: ReturnType<typeof fixture>) {
    value.memory.collection(PREPAID_TOPUPS).values = [];
    value.memory.user().automaticTopup = { enabled: true, amountMinor: 500, thresholdMinor: 1000, dailyCapMinor: 1000, monthlyCapMinor: 5000, consentedAt: new Date(), updatedAt: new Date() };
    let creates = 0;
    Object.assign(value.stripe, { paymentIntents: { list: async function* () {}, create: async () => { creates++; throw new Error('Unexpected automatic charge'); } } });
    return () => creates;
}

for (const status of ['canceled', 'past_due', 'unpaid'] as const) test(`automatic top-ups do not charge a locally ${status} usage subscription`, async () => {
    const value = fixture(), creates = automaticSettings(value);
    value.memory.user().stripeSubscriptionStatus = status;
    await reconcileAutomaticTopup('owner', value.runtime);
    assert.equal(creates(), 0);
    assert.equal(value.memory.collection(PREPAID_TOPUPS).values.length, 0);
});

test('a missing cancellation webhook cannot authorize a new automatic charge', async () => {
    const value = fixture(), creates = automaticSettings(value);
    value.stripe.subscriptionValues.get('sub_owner')!.status = 'canceled';
    await reconcileAutomaticTopup('owner', value.runtime);
    assert.equal(creates(), 0);
    assert.equal(value.memory.collection(PREPAID_TOPUPS).values.length, 0);
});

test('a stale unsent automatic attempt cannot initiate payment after cancellation', async () => {
    const value = fixture(), attempt = clone(value.attempt()), creates = automaticSettings(value);
    Object.assign(attempt, { kind: 'automatic', state: 'creating' });
    delete attempt.paymentIntentId; delete attempt.creditGrantId;
    value.memory.collection(PREPAID_TOPUPS).values.push(attempt as unknown as Record<string, unknown>);
    value.stripe.subscriptionValues.get('sub_owner')!.status = 'canceled';
    await reconcileAutomaticTopup('owner', value.runtime);
    assert.equal(creates(), 0);
    assert.equal(value.attempt().state, 'needs_review');
    assert.match(value.attempt().lastError!, /active usage service/);
});

for (const tier of ['subscription', 'lifetime'] as const) test(`a verified active ${tier === 'subscription' ? 'recurring' : 'Lifetime'} subscription funds one automatic top-up and recovers it without another charge`, async t => {
    const names = ['STRIPE_SECRET_KEY', 'MANAGED_COST_POLICY_JSON'];
    const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
    t.after(() => { for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; });
    process.env.STRIPE_SECRET_KEY = 'sk_test_fixture';
    const policy = JSON.parse(readFileSync(new URL('./__fixtures__/legacy-cost-policy.json', import.meta.url), 'utf8'));
    Object.assign(policy, { ...testProcessingCostEvidence(), infrastructureMicrosPerGiB: 0, infrastructureMicrosPerAudioMinute: 0, lifetimeUsage: { audioOverheadMicrosPerMinute: 0, recordingOverheadMicros: 0, storageOverheadMicrosPerGiBMonth: 0 }, version: 'automatic-topup-test', reviewedAt: '2020-01-01', expiresAt: '2099-01-01', paymentFeeBasisPoints: 0, paymentFixedMicros: 0, stripeBillingFeeBasisPoints: 0, stripeBillingFixedMicros: 0 });
    process.env.MANAGED_COST_POLICY_JSON = JSON.stringify(policy);
    const memory = new MemoryBillingDatabase(), stripe = new FakeBillingStripe(), grants = new TransferStripe();
    const plans = [planFixture(), planFixture({ key: 'lifetime', interval: 'lifetime', stripePriceId: 'price_lifetime' })];
    seedPublishedCatalogFixture(memory, plans, policy.version);
    const selected = plans[tier === 'lifetime' ? 1 : 0], subscription = stripe.subscription('sub_owner', 'active', { authSubject: 'owner' });
    if (tier === 'lifetime') for (const item of subscription.items.data) item.price = stripe.priceValues.get(item.id.endsWith('storage') ? 'price_lifetime_storage' : 'price_lifetime_transcription')!;
    stripe.subscriptionValues.push(subscription);
    memory.collection('users').values.push(userFixture({ planKey: selected.key, billingUsageCatalogVersion: selected.billingCatalogVersion, storageUsed: 0,
        billingEntitlement: { source: tier, reference: subscription.id, grantedAt: new Date() }, stripeSubscriptionId: subscription.id, stripeSubscriptionStatus: 'active',
        stripeMetering: { subscriptionId: subscription.id, storagePriceId: selected.stripeStoragePriceId!, transcriptionPriceId: selected.stripeTranscriptionPriceId!, verifiedAt: new Date() },
        automaticTopup: { enabled: true, amountMinor: 500, thresholdMinor: 100, dailyCapMinor: 500, monthlyCapMinor: 500, consentedAt: new Date(), updatedAt: new Date() } }) as never);
    const intents = new Map<string, Stripe.PaymentIntent>();
    let charges = 0;
    Object.assign(stripe.paymentIntents, {
        list: () => ({ async *[Symbol.asyncIterator]() { yield* [...intents.values()].map(clone); } }),
        create: async (params: Stripe.PaymentIntentCreateParams) => {
            charges++;
            const intent = { id: 'pi_auto', status: 'succeeded', amount_received: params.amount, currency: params.currency, customer: params.customer, metadata: params.metadata,
                latest_charge: { id: 'ch_auto', customer: params.customer, payment_intent: 'pi_auto', currency: params.currency, paid: true, amount_refunded: 0, refunded: false, disputed: false, balance_transaction: { currency: 'usd', fee: 0 } } } as unknown as Stripe.PaymentIntent;
            intents.set(intent.id, intent); return clone(intent);
        },
        retrieve: async (id: string) => clone(intents.get(id)!),
    });
    Object.assign(stripe.billing, { creditGrants: grants.billing.creditGrants });
    Object.assign(stripe, { charges: { retrieve: async () => clone(intents.get('pi_auto')!.latest_charge) } });
    if (tier === 'subscription') memory.user().billingOperation = { id: 'voluntary-upgrade', state: 'awaiting_payment', sourcePlanUsable: true, kind: 'plan_change',
        targetPlanKey: 'pro', amountDueMinor: 1000, currency: 'usd', createdAt: new Date(), updatedAt: new Date() };
    const runtime = { db: memory.asDb(), stripe: stripe.asStripe() };
    await reconcileAutomaticTopup('owner', runtime);
    assert.equal(charges, 1);
    const receipt = memory.collection(PREPAID_TOPUPS).values[0] as unknown as PrepaidTopup;
    assert.equal(receipt.state, 'complete');
    assert.equal(getPrepaidState(memory.user()).fundedMicros, 5_000_000);
    await reconcileAutomaticTopup('owner', runtime);
    assert.equal(charges, 1); assert.equal(grants.createCalls, 1);
    // Late reconciliation of an already-paid intent remains available after
    // terminal cancellation; it fulfills paid credit without creating payment.
    memory.collection(PREPAID_TOPUPS).values[0].state = 'paid';
    memory.user().stripeSubscriptionStatus = 'canceled'; subscription.status = 'canceled';
    await reconcileUsageTopups(20, runtime);
    assert.equal((memory.collection(PREPAID_TOPUPS).values[0] as unknown as PrepaidTopup).state, 'complete');
    assert.equal(charges, 1); assert.equal(grants.createCalls, 1);
    assert.equal(getPrepaidState(memory.user()).fundedMicros, 5_000_000);
});

test('completed prepaid receipt polling rotates fairly in standalone Mongo, including failed reads', { skip: !process.env.VOSIFT_TEST_MONGODB_URI }, async () => {
    const value = fixture(), client = new MongoClient(process.env.VOSIFT_TEST_MONGODB_URI!, { serverSelectionTimeoutMS: 15_000 });
    const db = client.db(`vt_prepaid_${randomUUID().replaceAll('-', '').slice(0, 18)}`);
    try {
        await client.connect();
        await db.collection('users').insertOne(clone(value.memory.user()));
        const fresh = new Date();
        await db.collection<PrepaidTopup>(PREPAID_TOPUPS).insertMany([
            { ...clone(value.attempt()), _id: 'recent', fundingCheckedAt: fresh },
            { ...clone(value.attempt()), _id: 'old', fundingCheckedAt: new Date(0) },
        ]);
        value.setUnavailable(true);
        const runtime = { db, stripe: value.runtime.stripe };
        await reconcileUsageTopups(1, runtime);
        const recent = await db.collection<PrepaidTopup>(PREPAID_TOPUPS).findOne({ _id: 'recent' });
        assert.equal(recent!.fundingCheckedAt!.getTime(), fresh.getTime());
        assert.match((await db.collection<PrepaidTopup>(PREPAID_TOPUPS).findOne({ _id: 'old' }))!.fundingLastError!, /outage/);
        value.setUnavailable(false);
        await reconcileUsageTopups(1, runtime);
        const checked = await db.collection<PrepaidTopup>(PREPAID_TOPUPS).findOne({ _id: 'recent' });
        assert.ok(checked!.fundingCheckedAt! > fresh);
        assert.equal(checked!.fundingLastError, undefined);
        assert.equal(value.reads(), 2);
    } finally { await db.dropDatabase(); await client.close(); }
});

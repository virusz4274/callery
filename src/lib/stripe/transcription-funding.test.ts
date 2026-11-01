import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBillingDatabase, planFixture, seedPublishedCatalogFixture, userFixture } from './test-support';
import { testProcessingCostEvidence } from './processing-test-support';
import { createTranscriptionReceipt, settleFailedTranscription, settleCanonicalTranscription } from './transcription-receipt';
import { creditBaseFunds, creditPrepaidFunds, getBillingAccount, getPrepaidState, ledgerKey } from './ledger';
import { PrepaidFundingRequiredError } from './billing-errors';

async function fixture(t: TestContext, options: { used?: number; allowance?: number; base?: number; prepaid?: number; asrCost?: number } = {}) {
    const old = { policy: process.env.MANAGED_COST_POLICY_JSON, billing: process.env.NEXT_PUBLIC_ENABLE_BILLING, stripe: process.env.STRIPE_SECRET_KEY };
    const policy = { version: 'SYNTHETIC-admission-costs-NOT-LIVE', reviewedAt: '2026-01-01', expiresAt: '2099-01-01',
        paymentFeeBasisPoints: 0, paymentFixedMicros: 0, stripeBillingFeeBasisPoints: 1000, stripeBillingFixedMicros: 0,
        minimumTopupMicros: 5_000_000, recoveryReserveMicros: 1, lifetimeHostingReserveMicros: 1,
        infrastructureMicrosPerAudioMinute: 0, infrastructureMicrosPerGiB: 0, aiBundleMicrosPerAudioMinute: 0, aiBundleFixedMicros: 0,
        storageCostMicrosPerGiBMonth: 20_000, storageOperationsMicrosPerGiBMonth: 1000,
        providers: Object.fromEntries(['soniox', 'gemini', 'elevenlabs'].map(provider => [provider, { costMicrosPerAudioMinute: 1000, fixedMicros: 0 }])),
        exports: { fixedMicros: 10, perGiBMicros: 100, maximumSourceBytes: 1000, recoveryReserveMicros: 1 },
        ...testProcessingCostEvidence(options.asrCost ?? 100),
    };
    process.env.MANAGED_COST_POLICY_JSON = JSON.stringify(policy); process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true'; process.env.STRIPE_SECRET_KEY = 'sk_test_fixture';
    t.after(() => { for (const [name, value] of [['MANAGED_COST_POLICY_JSON', old.policy], ['NEXT_PUBLIC_ENABLE_BILLING', old.billing], ['STRIPE_SECRET_KEY', old.stripe]]) {
        if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
    } });
    const memory = new MemoryBillingDatabase(), db = memory.asDb(), plan = planFixture();
    seedPublishedCatalogFixture(memory, [plan], policy.version);
    const user = userFixture({ planKey: 'standard', transcriptionUsed: options.used ?? 0, transcriptionAllocation: options.allowance ?? 3600,
        billingEntitlement: { source: 'subscription', grantedAt: new Date() }, stripeSubscriptionStatus: 'active', stripeSubscriptionId: 'sub_paid',
        billingSettings: { allowOverage: true }, billingUsageTariffs: plan.usageTariffs,
        stripeMetering: { subscriptionId: 'sub_paid', storagePriceId: plan.stripeStoragePriceId!, transcriptionPriceId: plan.stripeTranscriptionPriceId!, verifiedAt: new Date() } });
    await memory.collection('users').insertOne(user as never);
    if (options.base !== 0) await creditBaseFunds(user.authSubject, { id: 'base-paid', amountMicros: options.base ?? 10_000_000, reference: 'in_paid_fixture', kind: 'base', processorFeeMicros: 0 }, db);
    if (options.prepaid) await creditPrepaidFunds(user.authSubject, { id: 'topup-paid', amountMicros: options.prepaid, reference: 'cs_paid_fixture', source: 'stripe', processorFeeMicros: 0 }, db);
    return { memory, db, user };
}

test('included transcription requires no wallet, cost policy, expense reserve or retained base-principal budget', async t => {
    const { memory, db, user } = await fixture(t, { base: 0 });
    delete process.env.MANAGED_COST_POLICY_JSON;
    const receipt = await createTranscriptionReceipt(user, 'included', 'attempt', 'soniox', 'stt-async-v5', 120, 1024, db);
    assert.equal(receipt.retailMicros, 0); assert.equal(receipt.overheadCostMicros, undefined); assert.equal(receipt.minimumMarginBps, undefined);
    assert.equal(receipt.processingBudget, undefined); assert.ok(receipt.executionPolicy);
    assert.equal(getPrepaidState(memory.user()).fundedMicros, 0);
    assert.equal(getPrepaidState(memory.user()).reservedMicros, 0);
    assert.deepEqual(await createTranscriptionReceipt(user, 'included', 'attempt', 'soniox', 'stt-async-v5', 120, 1024, db), receipt);
    assert.equal(memory.collection('billing_provider_attempts').values.length, 1);
    assert.equal(Object.keys(getBillingAccount(memory.user()).reservations).length, 1);
});

test('partial overage reserves only the actual chargeable retail blocks', async t => {
    const { memory, db, user } = await fixture(t, { allowance: 45, prepaid: 5_000_000 });
    const receipt = await createTranscriptionReceipt(user, 'partial', 'attempt', 'soniox', 'stt-async-v5', 120, 1024, db);
    // 45 included seconds + 75 overage seconds = five blocks, not eight.
    assert.equal(receipt.consumedSeconds, 120); assert.equal(receipt.retailMicros, 12_500);
    assert.equal(receipt.overheadCostMicros, undefined);
    const reservation = getBillingAccount(memory.user()).reservations[ledgerKey(receipt.id)];
    assert.equal(reservation.retailMicros, 12_500); assert.equal(reservation.heldRetailMicros, 20_000);
    assert.equal(getPrepaidState(memory.user()).spentMicros, 0);
    assert.equal(getPrepaidState(memory.user()).reservedMicros, 20_000);
});

test('positive overage keeps one recording minimum and included work creates no usage fee', async t => {
    const { db, user } = await fixture(t, { allowance: 15, prepaid: 5_000_000 });
    const receipt = await createTranscriptionReceipt(user, 'minimum', 'attempt', 'soniox', 'stt-async-v5', 30, 1024, db);
    assert.equal(receipt.retailMicros, 10_000); assert.equal(receipt.overheadCostMicros, undefined);
});

test('customer retail credit is required for overage but operator principal is not an admission restriction', async t => {
    const { memory, db, user } = await fixture(t, { allowance: 0 });
    await assert.rejects(createTranscriptionReceipt(user, 'no-wallet', 'attempt', 'soniox', 'stt-async-v5', 30, 1024, db), PrepaidFundingRequiredError);
    assert.equal(memory.collection('billing_provider_attempts').values.length, 0);
    await creditPrepaidFunds(user.authSubject, { id: 'deposit', amountMicros: 5_000_000, reference: 'cs_deposit', source: 'stripe', processorFeeMicros: 0 }, db);
    const receipt = await createTranscriptionReceipt(user, 'no-operator-cash', 'attempt', 'soniox', 'stt-async-v5', 30, 1024, db);
    assert.equal(receipt.accountingMode, 'retail_only'); assert.equal(receipt.maximumCostMicros, 0);
    assert.equal(memory.collection('billing_provider_attempts').values.length, 1);
    assert.equal(memory.collection('billing_processing_budgets').values.length, 0);
});


test('an unknown submitted audio outcome retains retail credit until late authoritative success', async t => {
    const { memory, db, user } = await fixture(t, { allowance: 0, prepaid: 5_000_000, base: 0 });
    delete process.env.MANAGED_COST_POLICY_JSON;
    const receipt = await createTranscriptionReceipt(user, 'lost-response', 'attempt', 'soniox', 'stt-async-v5', 60, 1024, db);
    const held = getPrepaidState(memory.user()).reservedMicros;
    await settleFailedTranscription(user.authSubject, receipt, db);
    assert.equal(getPrepaidState(memory.user()).reservedMicros, held);
    assert.equal(getBillingAccount(memory.user()).reservations[ledgerKey(receipt.id)].state, 'reserved');
    await settleCanonicalTranscription(user.authSubject, receipt, db);
    await settleCanonicalTranscription(user.authSubject, receipt, db);
    assert.equal(getPrepaidState(memory.user()).reservedMicros, 0);
    assert.equal(getPrepaidState(memory.user()).spentMicros, 10_000);
});

test('authoritative audio failure releases allowance and retail claims without a customer charge', async t => {
    const { memory, db, user } = await fixture(t, { allowance: 0, prepaid: 5_000_000 });
    const receipt = await createTranscriptionReceipt(user, 'failed-response', 'attempt', 'soniox', 'stt-async-v5', 60, 1024, db);
    await settleFailedTranscription(user.authSubject, receipt, db, 'failed');
    assert.equal(getPrepaidState(memory.user()).reservedMicros, 0);
    assert.equal(getPrepaidState(memory.user()).spentMicros, 0);
    assert.equal(memory.user().transcriptionUsed, 0);
});

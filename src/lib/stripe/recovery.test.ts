import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryDeadline, recoveryWarningDays, hasUnpaidService, processBillingRecovery, expiredTrialStart } from './recovery';
import { financialAccountSnapshot, cancellationBoundary } from './financial-settlement';
import { userFixture, MemoryBillingDatabase, FakeBillingStripe } from './test-support';
import type Stripe from 'stripe';
import { Collections } from '@/lib/mongodb';
import { usageTariffFixture, archiveUsageTariffFixture } from './usage-test-support';
import { creditBaseFunds, creditPrepaidFunds, ensureBillingPeriod, getBillingAccount } from './ledger';
import { PrepaidFundingRequiredError } from './billing-errors';
import type { ManagedCostPolicy } from './economics';
import { refreshBillingForPurge } from './reconcile';
import { INTERNAL_STORAGE_EXPENSES } from '@/lib/integrations/internal-storage-expenses';

test('recovery has a fixed 30-day clock and warnings are replayable without extending retention', () => {
    const start = new Date('2026-01-01T12:00:00Z');
    assert.equal(recoveryDeadline(start).toISOString(), '2026-01-31T12:00:00.000Z');
    assert.deepEqual(recoveryWarningDays(start, new Date('2026-01-24T12:00:00Z')), [0, 23]);
    assert.deepEqual(recoveryWarningDays(start, new Date('2026-01-30T12:00:00Z')), [0, 23, 29]);
    assert.equal(hasUnpaidService({ ...userFixture(), stripeSubscriptionStatus: 'canceled' }), true);
    assert.equal(hasUnpaidService({ ...userFixture(), stripeSubscriptionStatus: 'active', stripePaymentIssues: {} }), false);
});

test('financial erasure retains settlement references without identity, credentials or content', () => {
    const account = financialAccountSnapshot({ ...userFixture(), stripeCustomerId: 'cus_paid', stripeSubscriptionId: 'sub_paid', googleSync: { status: 'completed', refreshTokenCiphertext: 'secret' } });
    const text = JSON.stringify(account);
    assert.equal(account.stripeCustomerId, 'cus_paid');
    assert.equal(account.disabled, true);
    for (const field of ['email', 'name', 'phoneNumber', 'googleSync', 'pushSubscriptions']) assert.equal(field in account, false);
    assert.ok(!text.includes('secret'));
});

test('deletion stops annual base renewal at its own boundary, separate from monthly usage', () => {
    const subscription = { items: { data: [
        { current_period_end: 1800000000, price: { recurring: { usage_type: 'metered' } } },
        { current_period_end: 1820000000, price: { recurring: { usage_type: 'licensed' } } },
    ] } } as unknown as Stripe.Subscription;
    assert.equal(cancellationBoundary(subscription, new Date('2026-01-01')).getTime(), 1820000000 * 1000);
});

function trialRecoveryFixture(expiry: Date) {
    const memory = new MemoryBillingDatabase();
    const user = userFixture({ trialEndsAt: expiry, storageUsed: 20 });
    delete user.stripeCustomerId;
    memory.collection(Collections.USERS).values.push(user as unknown as Record<string, unknown>);
    memory.collection(Collections.RECORDINGS).values.push({ _id: 'recording', authSubject: 'owner', r2Key: 'trial/audio.mp3' });
    for (const name of [Collections.RECORDINGS, Collections.EXPORT_JOBS, Collections.CONTACTS, 'search_embedding_cache', 'processing_execution_policies', 'processing_provider_calls', 'export_object_cleanup']) {
        const rows = memory.collection(name);
        Object.assign(rows, { updateMany: async () => ({ modifiedCount: 0 }), deleteMany: async (filter: { authSubject?: string; subject?: string }) => {
            const before = rows.values.length;
            rows.values = rows.values.filter(row => filter.authSubject ? row.authSubject !== filter.authSubject : row.subject !== filter.subject);
            return { deletedCount: before - rows.values.length };
        } });
    }
    return { memory, db: memory.asDb() };
}

test('Internal storage stays observable without pricing and old customer failures cannot purge its media', async t => {
    const prior = { enabled: process.env.NEXT_PUBLIC_ENABLE_BILLING, policy: process.env.MANAGED_COST_POLICY_JSON };
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true'; delete process.env.MANAGED_COST_POLICY_JSON;
    t.after(() => {
        if (prior.enabled === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING; else process.env.NEXT_PUBLIC_ENABLE_BILLING = prior.enabled;
        if (prior.policy === undefined) delete process.env.MANAGED_COST_POLICY_JSON; else process.env.MANAGED_COST_POLICY_JSON = prior.policy;
    });
    const { memory, db } = trialRecoveryFixture(new Date(0));
    Object.assign(memory.user(), { planKey: 'internal', storageAllocation: 1024 ** 4,
        billingEntitlement: { source: 'admin', reference: 'owned-assignment', grantedAt: new Date() },
        stripeSubscriptionStatus: 'canceled', stripePaymentIssues: { in_previous: { state: 'failed', subscriptionId: 'sub_previous', updatedAt: new Date() } },
        billingRecovery: { startedAt: new Date(0), purgeAt: new Date(1), warnings: [] } });
    let removed = 0;
    assert.equal(hasUnpaidService(memory.user()), false);
    const result = await processBillingRecovery(db, 50, async () => { removed++; });
    assert.equal(result.purged, 0);
    assert.equal(result.started, 0);
    assert.equal(removed, 0);
    assert.equal(memory.collection(Collections.RECORDINGS).values.length, 1);
    assert.equal(memory.user().storageUsed, 20);
    assert.equal(memory.collection(INTERNAL_STORAGE_EXPENSES).values.length, 0);
    assert.ok(memory.user().stripePaymentIssues?.in_previous);
    assert.equal(memory.user().storageAllocation, 1024 ** 4);
});

test('an expired customerless trial purges on its original expiry plus 30 days without Stripe', async t => {
    const prior = process.env.NEXT_PUBLIC_ENABLE_BILLING;
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
    t.after(() => { if (prior === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING; else process.env.NEXT_PUBLIC_ENABLE_BILLING = prior; });
    const expiry = new Date(Date.now() - 45 * 86400_000), { memory, db } = trialRecoveryFixture(expiry);
    const deleted: string[] = [];
    const result = await processBillingRecovery(db, 50, async key => { deleted.push(key); });
    assert.equal(result.purged, 1); assert.equal(result.failed, 0);
    assert.equal(memory.user().billingRecovery?.startedAt.getTime(), expiry.getTime());
    assert.equal(memory.user().billingRecovery?.purgeAt.getTime(), recoveryDeadline(expiry).getTime());
    assert.deepEqual(deleted, ['trial/audio.mp3']);
    assert.equal(memory.collection(Collections.RECORDINGS).values.length, 0);
    assert.equal(expiredTrialStart(userFixture({ trialEndsAt: new Date('invalid') })), undefined);
});

test('a concurrent administrator upgrade fails the trial purge claim before any stored object is removed', async t => {
    const prior = process.env.NEXT_PUBLIC_ENABLE_BILLING;
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
    t.after(() => { if (prior === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING; else process.env.NEXT_PUBLIC_ENABLE_BILLING = prior; });
    const { memory, db } = trialRecoveryFixture(new Date(Date.now() - 45 * 86400_000));
    const users = memory.collection(Collections.USERS), update = users.updateOne.bind(users);
    Object.assign(users, { updateOne: async (filter: Record<string, unknown>, patch: Record<string, unknown>) => {
        if ('billingRecovery.purgingAt' in (patch.$set as Record<string, unknown> || {})) {
            memory.user().billingEntitlement = { source: 'admin', grantedAt: new Date(), reference: 'concurrent-upgrade' };
            memory.user().planKey = 'internal';
        }
        return update(filter, patch);
    } });
    let removed = 0;
    const result = await processBillingRecovery(db, 50, async () => { removed++; });
    assert.equal(result.purged, 0); assert.equal(removed, 0);
    assert.equal(memory.collection(Collections.RECORDINGS).values.length, 1);
    assert.equal(memory.user().billingEntitlement?.source, 'admin');
});

test('a customer or purchase created after the customerless preflight defers trial purge for authoritative reconciliation', async t => {
    const prior = process.env.NEXT_PUBLIC_ENABLE_BILLING;
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
    t.after(() => { if (prior === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING; else process.env.NEXT_PUBLIC_ENABLE_BILLING = prior; });
    const { memory, db } = trialRecoveryFixture(new Date(Date.now() - 45 * 86400_000));
    const users = memory.collection(Collections.USERS), read = users.findOne.bind(users);
    let reads = 0;
    Object.assign(users, { findOne: async (filter: Record<string, unknown>) => {
        const snapshot = await read(filter);
        if (++reads === 2) {
            users.values[0].stripeCustomerId = 'cus_concurrent';
            users.values[0].pendingCheckout = { phase: 'creating', attemptId: 'concurrent-purchase' };
        }
        return snapshot;
    } });
    let removed = 0;
    const result = await processBillingRecovery(db, 50, async () => { removed++; });
    assert.equal(result.purged, 0); assert.equal(removed, 0); assert.equal(result.failed, 0);
    assert.equal(memory.user().stripeCustomerId, 'cus_concurrent');
    assert.equal(memory.collection(Collections.RECORDINGS).values.length, 1);
});

test('an in-flight billing lease prevents the irreversible trial purge claim', async t => {
    const prior = process.env.NEXT_PUBLIC_ENABLE_BILLING;
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
    t.after(() => { if (prior === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING; else process.env.NEXT_PUBLIC_ENABLE_BILLING = prior; });
    const { memory, db } = trialRecoveryFixture(new Date(Date.now() - 45 * 86400_000));
    memory.user().stripeBillingLease = { owner: 'checkout-worker', until: new Date(Date.now() + 60_000) };
    let removed = 0;
    const result = await processBillingRecovery(db, 50, async () => { removed++; });
    assert.equal(result.purged, 0); assert.equal(removed, 0); assert.equal(result.failed, 0);
    assert.equal(memory.collection(Collections.RECORDINGS).values.length, 1);
});

test('an expired crashed billing lease cannot retain an unfunded trial archive forever', async t => {
    const prior = process.env.NEXT_PUBLIC_ENABLE_BILLING;
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
    t.after(() => { if (prior === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING; else process.env.NEXT_PUBLIC_ENABLE_BILLING = prior; });
    const { memory, db } = trialRecoveryFixture(new Date(Date.now() - 45 * 86400_000));
    memory.user().stripeBillingLease = { owner: 'crashed-worker', until: new Date(Date.now() - 60_000) };
    let removed = 0;
    const result = await processBillingRecovery(db, 50, async () => { removed++; });
    assert.equal(result.purged, 1); assert.equal(removed, 1); assert.equal(result.failed, 0);
});

function recoveryCostPolicy(): ManagedCostPolicy {
    return { version: 'recovery-evidence', reviewedAt: '2020-01-01', expiresAt: '2099-01-01', paymentFeeBasisPoints: 0,
        paymentFixedMicros: 0, stripeBillingFeeBasisPoints: 0, stripeBillingFixedMicros: 0, minimumTopupMicros: 5_000_000, recoveryReserveMicros: 1, lifetimeHostingReserveMicros: 1,
        infrastructureMicrosPerAudioMinute: 0, infrastructureMicrosPerGiB: 0, aiBundleMicrosPerAudioMinute: 0, aiBundleFixedMicros: 0,
        storageCostMicrosPerGiBMonth: 10_000, storageOperationsMicrosPerGiBMonth: 0,
        providers: { soniox: { costMicrosPerAudioMinute: 100, fixedMicros: 0 }, gemini: { costMicrosPerAudioMinute: 100, fixedMicros: 0 }, elevenlabs: { costMicrosPerAudioMinute: 100, fixedMicros: 0 } },
        ai: {}, exports: { fixedMicros: 0, perGiBMicros: 0, maximumSourceBytes: 1_000_000, recoveryReserveMicros: 1 },
        lifetimeUsage: { audioOverheadMicrosPerMinute: 0, recordingOverheadMicros: 0, storageOverheadMicrosPerGiBMonth: 0 } };
}

async function lifetimeRecoveryFixture(options: { prepaid?: boolean; processorFeeMicros?: number; baseFunding?: boolean; existingRecovery?: boolean } = {}) {
    const { memory, db } = trialRecoveryFixture(new Date(Date.now() + 86400_000));
    Object.assign(memory.user(), { billingEntitlement: { source: 'lifetime', grantedAt: new Date() }, stripeCustomerId: 'cus_lifetime',
        stripeSubscriptionId: 'sub_usage', stripeSubscriptionStatus: 'active', planKey: 'lifetime', storageUsed: 1024 ** 3, storageAllocation: 0,
        stripeMetering: { subscriptionId: 'sub_usage', storagePriceId: 'price_lifetime_storage', transcriptionPriceId: 'price_lifetime_transcription', verifiedAt: new Date() },
        billingUsageTariffs: usageTariffFixture('lifetime') });
    await archiveUsageTariffFixture(db, memory.user().billingUsageTariffs!);
    if (options.existingRecovery) {
        const startedAt = new Date(Date.now() - 45 * 86400_000);
        memory.user().billingRecovery = { startedAt, purgeAt: recoveryDeadline(startedAt), warnings: [0, 23, 29] };
    }
    if (options.baseFunding !== false) await creditBaseFunds('owner', { id: 'lifetime-payment', reference: 'in_lifetime', kind: 'lifetime', amountMicros: 250_000_000 }, db);
    if (options.prepaid !== false) await creditPrepaidFunds('owner', { id: 'usage-payment', reference: 'cg_usage', source: 'stripe', amountMicros: 5_000_000,
        ...(options.processorFeeMicros !== undefined ? { processorFeeMicros: options.processorFeeMicros } : {}) }, db);
    return { memory, db };
}

test('a verified prepaid shortage starts recovery but cost and payment evidence failures cannot start or advance it', async t => {
    const prior = { enabled: process.env.NEXT_PUBLIC_ENABLE_BILLING, policy: process.env.MANAGED_COST_POLICY_JSON };
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
    t.after(() => {
        for (const [name, value] of [['NEXT_PUBLIC_ENABLE_BILLING', prior.enabled], ['MANAGED_COST_POLICY_JSON', prior.policy]]) {
            if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
        }
    });
    await t.test('only an actual spendable-credit shortage starts the recovery clock', async () => {
        process.env.MANAGED_COST_POLICY_JSON = JSON.stringify(recoveryCostPolicy());
        const { memory, db } = await lifetimeRecoveryFixture({ prepaid: false });
        await assert.rejects(ensureBillingPeriod('owner', db), PrepaidFundingRequiredError);
        let removed = 0;
        const result = await processBillingRecovery(db, 50, async () => { removed++; });
        assert.equal(result.started, 1); assert.equal(result.purged, 0); assert.equal(removed, 0);
        assert.ok(memory.user().billingRecovery);
    });
    await t.test('configuration review pauses an existing expired recovery without deleting or altering its clock', async () => {
        process.env.MANAGED_COST_POLICY_JSON = JSON.stringify(recoveryCostPolicy());
        const { memory, db } = await lifetimeRecoveryFixture({ existingRecovery: true, processorFeeMicros: 0 });
        memory.user().billingReview = { reason: 'meter_configuration_invalid', createdAt: new Date() };
        delete memory.user().stripeMetering;
        const originalRecovery = structuredClone(memory.user().billingRecovery);
        let removed = 0;
        const result = await processBillingRecovery(db, 50, async () => { removed++; });
        assert.equal(result.started, 0); assert.equal(result.purged, 0); assert.equal(result.failed, 1); assert.equal(removed, 0);
        assert.deepEqual(memory.user().billingRecovery, originalRecovery);
        assert.equal(memory.collection(Collections.RECORDINGS).values.length, 1);
    });
    for (const existingRecovery of [false, true]) await t.test(`funded storage below estimated cost remains usable; ${existingRecovery ? 'expired recovery is restored' : 'no recovery starts'}`, async () => {
        const policy = recoveryCostPolicy(); process.env.MANAGED_COST_POLICY_JSON = JSON.stringify(policy);
        const { memory, db } = await lifetimeRecoveryFixture({ existingRecovery, processorFeeMicros: 0 });
        process.env.MANAGED_COST_POLICY_JSON = JSON.stringify({ ...policy, version: 'advisory-storage-evidence', storageCostMicrosPerGiBMonth: 1_000_000 });
        await ensureBillingPeriod('owner', db);
        let removed = 0;
        const result = await processBillingRecovery(db, 50, async () => { removed++; });
        assert.equal(result.started, 0); assert.equal(result.purged, 0); assert.equal(result.failed, 0);
        assert.equal(result.restored, existingRecovery ? 1 : 0); assert.equal(removed, 0);
        assert.equal(memory.user().billingRecovery, undefined);
        assert.equal(memory.collection(Collections.RECORDINGS).values.length, 1);
    });
    for (const scenario of ['missing usage tariff', 'mismatched usage tariff'] as const) {
        for (const existingRecovery of [false, true]) await t.test(`${scenario}; ${existingRecovery ? 'expired recovery remains paused' : 'no recovery clock starts'}`, async () => {
            const policy = recoveryCostPolicy(); process.env.MANAGED_COST_POLICY_JSON = JSON.stringify(policy);
            const { memory, db } = await lifetimeRecoveryFixture({ existingRecovery, processorFeeMicros: 0 });
            const originalRecovery = memory.user().billingRecovery && structuredClone(memory.user().billingRecovery);
            if (scenario === 'missing usage tariff') delete memory.user().billingUsageTariffs;
            if (scenario === 'mismatched usage tariff') memory.user().billingUsageTariffs!.storage.priceId = 'price_wrong';
            await assert.rejects(ensureBillingPeriod('owner', db), error => error instanceof Error && !(error instanceof PrepaidFundingRequiredError));
            let removed = 0;
            const result = await processBillingRecovery(db, 50, async () => { removed++; });
            assert.equal(result.started, 0); assert.equal(result.purged, 0); assert.equal(result.failed, 1); assert.equal(removed, 0);
            assert.deepEqual(memory.user().billingRecovery, originalRecovery);
            assert.equal(memory.collection(Collections.RECORDINGS).values.length, 1);
        });
    }
});

test('a review arriving during retention preflight or its final claim keeps media and the recovery clock', async t => {
    const prior = process.env.NEXT_PUBLIC_ENABLE_BILLING; process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
    t.after(() => { if (prior === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING; else process.env.NEXT_PUBLIC_ENABLE_BILLING = prior; });
    for (const review of ['billing', 'cost'] as const) for (const phase of ['preflight', 'claim'] as const) await t.test(`${review} review at ${phase}`, async () => {
        const expiry = new Date(Date.now() - 45 * 86400_000), { memory, db } = trialRecoveryFixture(expiry);
        memory.user().billingRecovery = { startedAt: expiry, purgeAt: recoveryDeadline(expiry), warnings: [0, 23, 29] };
        const original = structuredClone(memory.user().billingRecovery), users = memory.collection(Collections.USERS);
        const attachReview = () => {
            if (review === 'billing') memory.user().billingReview = { reason: 'concurrent_financial_review', createdAt: new Date() };
            else {
                memory.user().billingAccount ||= getBillingAccount({});
                memory.user().billingAccount!.costReview = { reason: 'verified_provider_cost_requires_operating_funding', evidenceId: 'concurrent-cost', at: new Date() };
            }
        };
        if (phase === 'preflight') {
            const read = users.findOne.bind(users); let reads = 0;
            Object.assign(users, { findOne: async (filter: Record<string, unknown>) => {
                const snapshot = await read(filter); if (++reads === 1) attachReview(); return snapshot;
            } });
        } else {
            const update = users.updateOne.bind(users);
            Object.assign(users, { updateOne: async (filter: Record<string, unknown>, patch: Record<string, unknown>) => {
                if ('billingRecovery.purgingAt' in (patch.$set as Record<string, unknown> || {})) attachReview();
                return update(filter, patch);
            } });
        }
        let removed = 0; const result = await processBillingRecovery(db, 50, async () => { removed++; });
        assert.equal(result.purged, 0); assert.equal(result.restored, 0); assert.equal(removed, 0);
        assert.deepEqual(memory.user().billingRecovery, original); assert.equal(memory.collection(Collections.RECORDINGS).values.length, 1);
        assert.ok(review === 'billing' ? memory.user().billingReview : memory.user().billingAccount?.costReview);
    });
});

test('a funded recovery restoration cannot erase a concurrent financial or operating-cost review', async t => {
    const prior = { enabled: process.env.NEXT_PUBLIC_ENABLE_BILLING, policy: process.env.MANAGED_COST_POLICY_JSON };
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true'; process.env.MANAGED_COST_POLICY_JSON = JSON.stringify(recoveryCostPolicy());
    t.after(() => {
        if (prior.enabled === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING; else process.env.NEXT_PUBLIC_ENABLE_BILLING = prior.enabled;
        if (prior.policy === undefined) delete process.env.MANAGED_COST_POLICY_JSON; else process.env.MANAGED_COST_POLICY_JSON = prior.policy;
    });
    for (const review of ['billing', 'cost'] as const) await t.test(review, async () => {
        const { memory, db } = await lifetimeRecoveryFixture({ existingRecovery: true, processorFeeMicros: 0 });
        const original = structuredClone(memory.user().billingRecovery), users = memory.collection(Collections.USERS), update = users.updateOne.bind(users);
        Object.assign(users, { updateOne: async (filter: Record<string, unknown>, patch: Record<string, unknown>) => {
            if ('billingRecovery' in (patch.$unset as Record<string, unknown> || {})) {
                if (review === 'billing') memory.user().billingReview = { reason: 'concurrent_financial_review', createdAt: new Date() };
                else memory.user().billingAccount!.costReview = { reason: 'verified_provider_cost_requires_operating_funding', evidenceId: 'concurrent-cost', at: new Date() };
            }
            return update(filter, patch);
        } });
        let removed = 0; const result = await processBillingRecovery(db, 50, async () => { removed++; });
        assert.equal(result.restored, 0); assert.equal(result.purged, 0); assert.equal(removed, 0);
        assert.deepEqual(memory.user().billingRecovery, original); assert.equal(memory.collection(Collections.RECORDINGS).values.length, 1);
        assert.ok(review === 'billing' ? memory.user().billingReview : memory.user().billingAccount?.costReview);
    });
});

test('authoritative purge refresh preserves unknown financial-review blocks before Stripe calls', async () => {
    const memory = new MemoryBillingDatabase(), stripe = new FakeBillingStripe(), user = userFixture({ billingAccount: getBillingAccount({}) });
    user.billingAccount!.costReview = { reason: 'unclassified_financial_evidence', evidenceId: 'cost', at: new Date() };
    memory.collection(Collections.USERS).values.push(user as never);
    let calls = 0; Object.assign(stripe.customers, { retrieve: async () => { calls++; throw new Error('Unexpected Stripe request'); } });
    await assert.rejects(refreshBillingForPurge('owner', { db: memory.asDb(), stripe: stripe.asStripe() }), /Resolve billing and cost review/);
    assert.equal(calls, 0); assert.ok(memory.user().billingAccount!.costReview);
});


test('missing costs, processor fees and old expense reviews cannot start recovery or block funded restoration', async t => {
    const prior = { enabled: process.env.NEXT_PUBLIC_ENABLE_BILLING, policy: process.env.MANAGED_COST_POLICY_JSON };
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true'; process.env.MANAGED_COST_POLICY_JSON = JSON.stringify(recoveryCostPolicy());
    t.after(() => { if (prior.enabled === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING; else process.env.NEXT_PUBLIC_ENABLE_BILLING = prior.enabled;
        if (prior.policy === undefined) delete process.env.MANAGED_COST_POLICY_JSON; else process.env.MANAGED_COST_POLICY_JSON = prior.policy; });
    for (const existingRecovery of [false, true]) {
        const { memory, db } = await lifetimeRecoveryFixture({ existingRecovery, baseFunding: false });
        memory.user().billingAccount!.costReview = { reason: 'verified_provider_cost_requires_operating_funding', evidenceId: 'historical-expense', at: new Date() };
        delete process.env.MANAGED_COST_POLICY_JSON;
        await ensureBillingPeriod('owner', db);
        let removed = 0; const result = await processBillingRecovery(db, 50, async () => { removed++; });
        assert.equal(result.started, 0); assert.equal(result.purged, 0); assert.equal(result.failed, 0); assert.equal(removed, 0);
        assert.equal(result.restored, existingRecovery ? 1 : 0); assert.equal(memory.user().billingRecovery, undefined);
        assert.equal(memory.user().billingAccount!.costReview?.reason, 'verified_provider_cost_requires_operating_funding');
    }
});

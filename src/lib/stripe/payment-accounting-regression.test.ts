import { testProcessingCostEvidence } from './processing-test-support';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { BILLING_CATALOG } from './catalog';
import { FakeBillingStripe, MemoryBillingDatabase, clone, fixtureUsageTariffs, planFixture, seedPublishedCatalogFixture, userFixture } from './test-support';
import { getBillingAccount, ledgerKey, mutateBillingAccount, reconcileUsageInvoiceRounding, reserveCost, type UsagePeriod } from './ledger';
import { accumulateUsageCharge, createUsageAmountAccumulator, quoteUsageQuantity } from './usage-tariff';
import { createUsageTopup } from './prepaid-topup';
import { REQUIRED_BILLING_CHECKS, type BillingLaunchEvidence } from './launch-gate';

function fundedAccount() {
    const account = getBillingAccount({});
    account.prepaidFundedMicros = 1_000_000;
    account.fundingLots.prepaid = { id: 'prepaid', reference: 'cg', source: 'stripe', kind: 'prepaid', amountMicros: 1_000_000, creditedMicros: 0, spentMicros: 0, costMicros: 0, reservedCostMicros: 0, processorFeeMicros: 0, createdAt: new Date() };
    account.fundingLots.base = { id: 'base', reference: 'in', source: 'stripe', kind: 'base', amountMicros: 10_000_000, creditedMicros: 0, costMicros: 0, reservedCostMicros: 0, createdAt: new Date() };
    return account;
}

test('a lifecycle hold or access revocation wins over an in-flight ledger admission', async () => {
    for (const field of ['billingGrantTransfer', 'disabled', 'billingReview'] as const) {
        const memory = new MemoryBillingDatabase();
        memory.collection('users').values.push(userFixture({ billingAccount: fundedAccount() }) as never);
        let changed = false;
        await assert.rejects(mutateBillingAccount('owner', (account, snapshot) => {
            reserveCost(account, snapshot, { id: 'admission', kind: 'transcription', maximumCostMicros: 100, retailMicros: 10_000, usageTier: 'recurring', expiresAt: new Date(),
                paymentFeeSchedule: { costPolicyVersion: 'test', costPolicyFingerprint: 'test', expiresAt: '2099-01-01', paymentFeeBasisPoints: 0, paymentFixedMicros: 0, minimumTopupMicros: 5_000_000 } });
            if (!changed) {
                changed = true;
                Object.assign(memory.user(), { [field]: field === 'disabled' ? true : { operationId: 'transfer', startedAt: new Date(), reason: 'test' } });
            }
        }, memory.asDb()), /spending is paused/);
        assert.equal(Object.keys(memory.user().billingAccount!.reservations).length, 0, field);
        assert.equal(memory.user().billingAccount!.prepaidReservedMicros, 0, field);
    }
});

test('tariff activation invalidates the accepted snapshot before a reservation commits', async () => {
    const memory = new MemoryBillingDatabase(), original = fixtureUsageTariffs();
    memory.collection('users').values.push(userFixture({ billingAccount: fundedAccount(), billingUsageTariffs: original }) as never);
    let reads = 0;
    await assert.rejects(mutateBillingAccount('owner', (_account, snapshot) => {
        reads++;
        if (snapshot.billingUsageTariffs!.transcription.id !== original.transcription.id) throw new Error('Billing changed before provider submission.');
        memory.user().billingUsageTariffs = fixtureUsageTariffs('recurring', undefined, 'replacement-catalog');
    }, memory.asDb()), /Billing changed/);
    assert.equal(reads, 2);
    assert.equal(memory.user().billingAccount!.revision, 0);
});

function oldPeriod(): UsagePeriod {
    const bucket = createUsageAmountAccumulator(fixtureUsageTariffs().transcription);
    accumulateUsageCharge(bucket, 4);
    return { id: 'old', start: new Date('2026-01-01'), end: new Date('2026-02-01'), consumedSeconds: 60, storagePeakBytes: 0, chargeablePeakBytes: 0,
        storageCostMicros: 0, storageBilledMilliGiB: 0, storageChargedMicros: 0, usageAmounts: { [ledgerKey(`transcription:${bucket.tariff.priceId}`)]: bucket } };
}

test('compaction keeps old uninvoiced periods while archiving settled history', async () => {
    const memory = new MemoryBillingDatabase(), db = memory.asDb(), account = fundedAccount(), old = oldPeriod();
    account.periods.old = old;
    account.periods.settled = { ...clone(old), id: 'settled', usageAmounts: {} };
    for (let n = 0; n < 1000; n++) account.receipts[String(n)] = { id: String(n), consumedSeconds: 15, meterBlocks: 0, chargedMicros: 0, acceptedAt: new Date('2026-01-01'), periodId: 'old' };
    memory.collection('users').values.push(userFixture({ billingAccount: account }) as never);
    for (const name of ['billing_usage_receipts', 'billing_financial_archive']) {
        const table = memory.collection(name);
        Object.assign(table, { bulkWrite: async (operations: { updateOne: { filter: Record<string, unknown>; update: Record<string, unknown>; upsert: boolean } }[]) => {
            for (const operation of operations) await table.updateOne(operation.updateOne.filter, operation.updateOne.update, { upsert: operation.updateOne.upsert });
        } });
    }
    await mutateBillingAccount('owner', () => undefined, db);
    assert.ok(memory.user().billingAccount!.periods.old);
    assert.equal(memory.user().billingAccount!.periods.settled, undefined);
    assert.equal(memory.collection('billing_financial_archive').values.some(row => row.kind === 'period' && (row.data as UsagePeriod).id === 'old'), false);
});

test('a delayed invoice hydrates its archived period and keeps committed claims across partial invoices', async () => {
    const memory = new MemoryBillingDatabase(), db = memory.asDb(), account = fundedAccount(), period = oldPeriod(), tariff = fixtureUsageTariffs().transcription;
    account.prepaidSpentMicros = 10_000; account.fundingLots.prepaid.spentMicros = 10_000; account.recognizedRevenueMicros = 10_000;
    memory.collection('billing_financial_archive').values.push({ _id: 'old-source', authSubject: 'owner', kind: 'period', data: period });
    const input = { type: 'transcription' as const, meterPriceId: tariff.priceId, periodStart: 1767225600, periodEnd: 1769904000, exactAtoms: quoteUsageQuantity(tariff, 2).exactAtoms, principalMinor: 1, subject: 'owner', db };
    await reconcileUsageInvoiceRounding(account, input);
    await reconcileUsageInvoiceRounding(account, input);
    assert.equal(account.periods.old.archiveHydrated, true);
    assert.equal(account.periods.old.usageAmounts![ledgerKey(`transcription:${tariff.priceId}`)].invoicedExactAtoms, quoteUsageQuantity(tariff, 4).exactAtoms);
    assert.equal(account.prepaidSpentMicros, 20_000);
    await assert.rejects(reconcileUsageInvoiceRounding(account, input), /no matching uninvoiced/);
});

test('live top-ups use reviewed database catalog evidence without legacy environment evidence', async t => {
    const names = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_METER_WEBHOOK_SECRET', 'BILLING_LAUNCH_EVIDENCE_JSON', 'MANAGED_COST_POLICY_JSON'];
    const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
    t.after(() => { for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; });
    Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_live_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture', STRIPE_METER_WEBHOOK_SECRET: 'whsec_fixture',
        MANAGED_COST_POLICY_JSON: JSON.stringify({ version: 'topup-db-proof', reviewedAt: '2020-01-01', expiresAt: '2099-01-01', paymentFeeBasisPoints: 0, paymentFixedMicros: 0,
            stripeBillingFeeBasisPoints: 0, stripeBillingFixedMicros: 0, minimumTopupMicros: 5_000_000, recoveryReserveMicros: 1, lifetimeHostingReserveMicros: 1,
            infrastructureMicrosPerAudioMinute: 0, infrastructureMicrosPerGiB: 0, aiBundleMicrosPerAudioMinute: 0, aiBundleFixedMicros: 0, storageCostMicrosPerGiBMonth: 1, storageOperationsMicrosPerGiBMonth: 0,
            lifetimeUsage: { audioOverheadMicrosPerMinute: 0, recordingOverheadMicros: 0, storageOverheadMicrosPerGiBMonth: 0 }, providers: { soniox: { costMicrosPerAudioMinute: 1, fixedMicros: 0 }, gemini: { costMicrosPerAudioMinute: 1, fixedMicros: 0 }, elevenlabs: { costMicrosPerAudioMinute: 1, fixedMicros: 0 } }, ...testProcessingCostEvidence(), exports: { fixedMicros: 0, perGiBMicros: 0, maximumSourceBytes: 1, recoveryReserveMicros: 1 } }) });
    delete process.env.BILLING_LAUNCH_EVIDENCE_JSON;
    const memory = new MemoryBillingDatabase(), stripe = new FakeBillingStripe(), plans = [planFixture(), planFixture({ key: 'lifetime', interval: 'lifetime', stripePriceId: 'price_lifetime' })];
    seedPublishedCatalogFixture(memory, plans, 'topup-db-proof');
    const bundle = memory.collection('billing_catalog_bundles').values[0];
    bundle.livemode = true;
    bundle.acceptanceEvidence = { schemaVersion: 2, tariffVersion: BILLING_CATALOG.version, stripeAccountId: 'acct_fixture', livemode: true, catalogVersion: bundle._id,
        costFingerprint: 'test-cost-fingerprint', verifiedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 86400_000).toISOString(),
        priceIds: [...stripe.priceValues.keys()], checks: Object.fromEntries(REQUIRED_BILLING_CHECKS.map(check => [check, true])) };
    memory.collection('users').values.push(userFixture({ billingEntitlement: { source: 'subscription', grantedAt: new Date() }, billingUsageCatalogVersion: plans[0].billingCatalogVersion }) as never);
    Object.assign(stripe.checkout.sessions, { list: async function* () {} });
    const deps = { db: memory.asDb(), stripe: stripe.asStripe() };
    assert.ok((await createUsageTopup('owner', 500, { success: 'https://example.test/success', cancel: 'https://example.test/cancel' }, deps)).url);
    assert.equal(stripe.sessionCreates, 1);
    // A valid current recurring pair cannot authorize unreviewed Lifetime scopes.
    memory.collection('billing_prepaid_topups').values = [];
    stripe.sessions.clear();
    (bundle.acceptanceEvidence as BillingLaunchEvidence).priceIds = ['price_storage', 'price_transcription'];
    await assert.rejects(createUsageTopup('owner', 500, { success: 'https://example.test/success', cancel: 'https://example.test/cancel' }, deps), /does not cover/);
    assert.equal(stripe.sessionCreates, 1);
});

test('standalone Mongo rejects admission after a grant hold and retains delayed invoice sources', { skip: !process.env.VOSIFT_TEST_MONGODB_URI }, async () => {
    const client = new MongoClient(process.env.VOSIFT_TEST_MONGODB_URI!, { serverSelectionTimeoutMS: 15_000 });
    const db = client.db(`vt_accounting_${randomUUID().replaceAll('-', '').slice(0, 18)}`);
    try {
        await client.connect();
        await db.collection('users').insertOne(userFixture({ billingAccount: fundedAccount() }));
        let changed = false;
        await assert.rejects(mutateBillingAccount('owner', async (account, snapshot) => {
            reserveCost(account, snapshot, { id: 'admission', kind: 'transcription', maximumCostMicros: 100, retailMicros: 10_000, usageTier: 'recurring', expiresAt: new Date(),
                paymentFeeSchedule: { costPolicyVersion: 'test', costPolicyFingerprint: 'test', expiresAt: '2099-01-01', paymentFeeBasisPoints: 0, paymentFixedMicros: 0, minimumTopupMicros: 5_000_000 } });
            if (!changed) { changed = true; await db.collection('users').updateOne({ authSubject: 'owner' }, { $set: { billingGrantTransfer: { operationId: 'test', startedAt: new Date(), reason: 'test' } } }); }
        }, db), /spending is paused/);
        assert.equal(Object.keys((await db.collection('users').findOne({ authSubject: 'owner' }))!.billingAccount.reservations).length, 0);
        const account = fundedAccount(), period = oldPeriod();
        account.periods.old = period;
        for (let n = 0; n < 1000; n++) account.receipts[String(n)] = { id: String(n), consumedSeconds: 15, meterBlocks: 0, chargedMicros: 0, acceptedAt: new Date('2026-01-01'), periodId: 'old' };
        await db.collection('users').updateOne({ authSubject: 'owner' }, { $set: { billingAccount: account }, $unset: { billingGrantTransfer: '' } });
        await mutateBillingAccount('owner', () => undefined, db);
        assert.ok((await db.collection('users').findOne({ authSubject: 'owner' }))!.billingAccount.periods.old);
        assert.equal(await db.collection('billing_financial_archive').countDocuments({ kind: 'period' }), 0);
        // Model a previously archived period from before the retention repair.
        const recovered = fundedAccount(); recovered.prepaidSpentMicros = 10_000; recovered.recognizedRevenueMicros = 10_000; recovered.fundingLots.prepaid.spentMicros = 10_000;
        await db.collection('users').updateOne({ authSubject: 'owner' }, { $set: { billingAccount: recovered } });
        await db.collection('billing_financial_archive').insertOne({ authSubject: 'owner', kind: 'period', data: period });
        const tariff = fixtureUsageTariffs().transcription;
        await mutateBillingAccount('owner', ledger => reconcileUsageInvoiceRounding(ledger, { type: 'transcription', meterPriceId: tariff.priceId,
            periodStart: 1767225600, periodEnd: 1769904000, exactAtoms: quoteUsageQuantity(tariff, 4).exactAtoms, principalMinor: 1, subject: 'owner', db }), db);
        const final = (await db.collection('users').findOne({ authSubject: 'owner' }))!.billingAccount;
        assert.equal(final.periods.old.archiveHydrated, true);
        assert.equal(final.periods.old.usageAmounts[ledgerKey(`transcription:${tariff.priceId}`)].invoicedExactAtoms, quoteUsageQuantity(tariff, 4).exactAtoms);
        assert.equal(final.prepaidSpentMicros, 10_000);
    } finally {
        await db.dropDatabase();
        await client.close();
    }
});

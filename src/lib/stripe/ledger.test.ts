import { reserveLegacyCostFixture } from './legacy-test-support';
import { testProcessingCostEvidence } from './processing-test-support';
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { BILLING_CATALOG, managedProvider, storageMilliGiB, weightedBlocks, assertManagedTranscriptionLimits } from './catalog';
import { creditBaseFunds, creditPrepaidFunds, ensurePeriod, getBillingAccount, getPrepaidState, ledgerKey, mutateBillingAccount, putStoragePeak, releasePrepaidReservation, reserveCost, settleTranscription, settlePrepaidReservation, reserveEntitlementOperatingCosts, retainedFundingCapacity, settleReservation, operatingFundingCapacity, unearnedPrepaidFeeMicros } from './ledger';
import { OperatingFundingUnavailableError, PrepaidFundingRequiredError } from './billing-errors';
import { MemoryBillingDatabase, fixtureUsageTariffs, userFixture } from './test-support';
import { assertManagedEconomicsReady, assertPublishedUsageCostFloor, calculateAiCostMicros, getManagedCostPolicy, assertUsageCostMargin, estimateTranscriptionCostMicros, estimateTranscriptionInfrastructureMicros } from './economics';
import { classifyLegacyTranscription, legacyTranscriptionReceiptIds } from './migration';
import { refundableBaseMicros, reservePlanCredit, settlePlanCredit } from './plan-credit-economics';
import type { Recording } from '@/lib/db/types';
import { ObjectId } from 'mongodb';

export const fixtureCostPolicy = {
    version: 'test-only-not-live-cost-evidence', reviewedAt: '2026-01-01', expiresAt: '2099-01-01', paymentFeeBasisPoints: 0, paymentFixedMicros: 0,
    minimumTopupMicros: 5_000_000, recoveryReserveMicros: 1, lifetimeHostingReserveMicros: 1, infrastructureMicrosPerAudioMinute: 100, infrastructureMicrosPerGiB: 100, aiBundleMicrosPerAudioMinute: 100, aiBundleFixedMicros: 100,
    storageCostMicrosPerGiBMonth: 20_000, storageOperationsMicrosPerGiBMonth: 1000, stripeBillingFeeBasisPoints: 0, stripeBillingFixedMicros: 0,
    exports: { fixedMicros: 10, perGiBMicros: 1000, maximumSourceBytes: 10_000_000, recoveryReserveMicros: 1_000_000 },
    providers: { soniox: { costMicrosPerAudioMinute: 1700, fixedMicros: 0 }, gemini: { costMicrosPerAudioMinute: 5000, fixedMicros: 0 }, elevenlabs: { costMicrosPerAudioMinute: 3700, fixedMicros: 0 } },
    ...testProcessingCostEvidence(),
    ai: { ...testProcessingCostEvidence().ai, 'gemini:fixture-model': { inputUsdMicrosPerMillionTokens: 100_000, outputUsdMicrosPerMillionTokens: 200_000 } },
};
function policy(t: TestContext) {
    const old = process.env.MANAGED_COST_POLICY_JSON, key = process.env.STRIPE_SECRET_KEY;
    process.env.MANAGED_COST_POLICY_JSON = JSON.stringify(fixtureCostPolicy); process.env.STRIPE_SECRET_KEY = 'sk_test_fixture';
    t.after(() => { if (old === undefined) delete process.env.MANAGED_COST_POLICY_JSON; else process.env.MANAGED_COST_POLICY_JSON = old;
        if (key === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = key; });
}
async function fixture(t: TestContext) {
    policy(t);
    const memory = new MemoryBillingDatabase(), user = userFixture({ transcriptionUsed: 0, storageUsed: 0, storageAllocation: 0,
        stripeCurrentPeriodStart: new Date('2026-10-01'), billingEntitlement: { source: 'subscription', grantedAt: new Date() }, stripeSubscriptionId: 'sub',
        billingSettings: { allowOverage: true }, stripeMetering: { subscriptionId: 'sub', storagePriceId: 'price_storage', transcriptionPriceId: 'price_transcription', verifiedAt: new Date() } });
    memory.collection('users').values.push(user as unknown as Record<string, unknown>);
    const db = memory.asDb();
    await creditBaseFunds('owner', { id: 'base', amountMicros: 10_000_000, reference: 'in_test', kind: 'base' }, db);
    await creditPrepaidFunds('owner', { id: 'grant', amountMicros: 5_000_000, reference: 'grant_test', source: 'stripe' }, db);
    return { memory, db, user };
}
test('versioned integer units express the approved tariff and reject unpriced models', () => {
    assert.equal(weightedBlocks(16, 3), 6);
    assert.equal(storageMilliGiB(1), 1); assert.equal(storageMilliGiB(1073741824), 1000);
    assert.throws(() => managedProvider('gemini', 'unpriced-expensive-model'), /priced managed/);
    assert.equal(BILLING_CATALOG.providers.gemini.multiplier, 3);
});
test('cost evidence is required, bounded, and independent of provider marketing estimates', t => {
    policy(t); assert.equal(assertManagedEconomicsReady().version, fixtureCostPolicy.version);
    process.env.MANAGED_COST_POLICY_JSON = '{}'; assert.throws(getManagedCostPolicy, /incomplete/);
    process.env.MANAGED_COST_POLICY_JSON = JSON.stringify({ ...fixtureCostPolicy, ...testProcessingCostEvidence(9900), providers: { ...fixtureCostPolicy.providers, soniox: { costMicrosPerAudioMinute: 9900, fixedMicros: 0 } } });
    assert.doesNotThrow(() => assertPublishedUsageCostFloor(fixtureUsageTariffs()));
    assert.equal(calculateAiCostMicros({ inputUsdMicrosPerMillionTokens: 1_000_000, outputUsdMicrosPerMillionTokens: 2_000_000 }, { inputTokens: 10, outputTokens: 5, thoughtTokens: 2 }), 24);
});
test('concurrent prepaid reservations cannot spend one balance twice; funding receipts cannot mint twice', async t => {
    const { memory, db } = await fixture(t);
    await creditPrepaidFunds('owner', { id: 'grant', amountMicros: 5_000_000, reference: 'grant_test', source: 'stripe' }, db);
    const attempts = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => reserveLegacyCostFixture('owner', { id: `r${i}`, maximumCostMicros: 100,
        retailMicros: 1_000_000, kind: 'fixture', expiresAt: new Date(Date.now() + 60_000) }, db)));
    assert.equal(attempts.filter(row => row.status === 'fulfilled').length, 5);
    assert.equal(getPrepaidState(memory.user()).availableMicros, 0);
    await releasePrepaidReservation('owner', 'r0', db); await releasePrepaidReservation('owner', 'r0', db);
    assert.equal(getPrepaidState(memory.user()).availableMicros, 1_000_000);
});
test('successful completion consumes actual quota once, includes positive-charge minimum, and failed reservations consume none', async t => {
    const { memory, db } = await fixture(t), acceptedAt = new Date('2026-10-20');
    await mutateBillingAccount('owner', (account, user) => {
        ensurePeriod(account, user, acceptedAt);
        reserveCost(account, user, { id: 'failed', retailMicros: 10_000, maximumCostMicros: 100, kind: 'transcription', expiresAt: acceptedAt });
        reserveCost(account, user, { id: 'audio', retailMicros: 10_000, maximumCostMicros: 100, kind: 'transcription', expiresAt: acceptedAt });
    }, db);
    await releasePrepaidReservation('owner', 'failed', db);
    const input = { id: 'audio', consumedSeconds: 60, allowanceSeconds: 45, acceptedAt, customerId: 'cus', subscriptionId: 'sub', reservationId: 'audio', actualCostMicros: 100 };
    for (let replay = 0; replay < 3; replay++) await mutateBillingAccount('owner', (account, user) => settleTranscription(account, user, input), db);
    const account = getBillingAccount(memory.user()), receipt = account.receipts[ledgerKey('audio')];
    assert.equal(receipt.consumedSeconds, 60); assert.equal(receipt.meterBlocks, 4); assert.equal(receipt.chargedMicros, 10_000);
    assert.equal(account.periods[receipt.periodId].consumedSeconds, 60); assert.equal(Object.keys(account.outbox).length, 1);
    assert.equal(account.prepaidSpentMicros, 10_000);
});
test('storage chargeable peak survives deletion and allowance changes without retrobilling deleted files', async t => {
    const { memory, db } = await fixture(t), GiB = 1073741824;
    await mutateBillingAccount('owner', (account, user) => { user.storageAllocation = GiB; putStoragePeak(account, user, 2 * GiB, new Date('2026-10-20')); }, db);
    await mutateBillingAccount('owner', (account, user) => { user.storageAllocation = 0; putStoragePeak(account, user, GiB / 2, new Date('2026-10-20')); }, db);
    const account = getBillingAccount(memory.user()), period = account.periods[account.currentPeriodId!];
    assert.equal(period.storagePeakBytes, 2 * GiB); assert.equal(period.chargeablePeakBytes, GiB); assert.equal(period.storageBilledMilliGiB, 1000);
    assert.equal(period.storageChargedMicros, 200_000); assert.equal(Object.keys(account.outbox).length, 1);
});
test('monthly windows retain original day-of-month anchor, consumed quota and old-period receipts', async t => {
    const { memory, db } = await fixture(t);
    await mutateBillingAccount('owner', (account, user) => { user.stripeCurrentPeriodStart = new Date('2026-01-31');
        const jan = ensurePeriod(account, user, new Date('2026-02-01')); jan.consumedSeconds = 45;
        assert.equal(ensurePeriod(account, user, new Date('2026-03-01')).end.toISOString(), '2026-03-31T00:00:00.000Z');
        assert.equal(ensurePeriod(account, user, new Date('2026-02-01')).consumedSeconds, 45);
    }, db);
    assert.equal(Object.keys(getBillingAccount(memory.user()).periods).length, 2);
});
test('historical callback/manual aliases are classified without creating a third charge', () => {
    const recording = { _id: new ObjectId(), authSubject: 'owner', transcriptionProvider: 'soniox', externalTranscriptionId: 'external', transcriptionUsageReportId: 'soniox:external' } as Recording;
    const ids = legacyTranscriptionReceiptIds(recording);
    const events = ids.map(id => ({ _id: id, reportedValue: 60 }));
    assert.equal(classifyLegacyTranscription(recording, events as never).state, 'review');
    assert.equal(classifyLegacyTranscription(recording, events.slice(0, 1) as never).state, 'settled');
});

test('high estimated costs are advisory while provider duration/model limits remain blocking', t => {
    policy(t);
    process.env.MANAGED_COST_POLICY_JSON = JSON.stringify({ ...fixtureCostPolicy, infrastructureMicrosPerGiB: 1_000_000 });
    const tariff = fixtureUsageTariffs().transcription, provider = estimateTranscriptionCostMicros('soniox', 'stt-async-v5', 30);
    assert.ok(assertUsageCostMargin(tariff, 2, provider + estimateTranscriptionInfrastructureMicros(30, 2_147_483_648) + 150).contributionMicros < 0);
    assert.equal(assertUsageCostMargin(tariff, 2, provider + estimateTranscriptionInfrastructureMicros(30, 1024) + 150).nominalRetailMicros, 5000);
    assert.throws(() => assertManagedTranscriptionLimits('gemini', 'gemini-3.5-transcribe', 1801, 1024), /30 minutes/);
    assert.throws(() => assertManagedTranscriptionLimits('soniox', 'stt-async-v4', 30, 1024), /priced managed/);
});
test('actual processor fees reconcile independently of AI costs and prepaid principal keeps face value', async t => {
    const { memory, db } = await fixture(t);
    await mutateBillingAccount('owner', account => { account.fundingLots[ledgerKey('base')].costMicros = 500; account.recognizedCostMicros = 500; }, db);
    await creditBaseFunds('owner', { id: 'base', amountMicros: 10_000_000, reference: 'in_test', kind: 'base', processorFeeMicros: 300_000 }, db);
    await creditBaseFunds('owner', { id: 'base', amountMicros: 10_000_000, reference: 'in_test', kind: 'base', processorFeeMicros: 300_000 }, db);
    assert.equal(memory.user().billingAccount!.fundingLots[ledgerKey('base')].costMicros, 300_500);
    await creditPrepaidFunds('owner', { id: 'grant', amountMicros: 5_000_000, reference: 'grant_test', source: 'stripe', processorFeeMicros: 300_000 }, db);
    assert.equal(getPrepaidState(memory.user()).availableMicros, 5_000_000);
    await reserveLegacyCostFixture('owner', { id: 'fee-operation', retailMicros: 1_000_000, maximumCostMicros: 100, kind: 'fixture', expiresAt: new Date() }, db);
    await settlePrepaidReservation('owner', 'fee-operation', { actualCostMicros: 100, chargedMicros: 1_000_000 }, db);
    const account = getBillingAccount(memory.user());
    assert.equal(account.fundingLots[ledgerKey('grant')].processorFeeRecognizedMicros, 60_000);
    assert.equal(account.recognizedCostMicros, 360_600);
    assert.equal(account.prepaidSpentMicros, 1_000_000);
});

test('credit-funded lifetime protects operating obligations using original cash without minting revenue', async t => {
    const { memory, db } = await fixture(t);
    process.env.MANAGED_COST_POLICY_JSON = JSON.stringify({ ...fixtureCostPolicy, version: 'test-reviewed-lifetime-cost-v2', recoveryReserveMicros: 100_000, lifetimeHostingReserveMicros: 1_000_000 });
    const before = getBillingAccount(memory.user());
    const reserve = await reserveEntitlementOperatingCosts('owner', 'lifetime:credit-funded', 'lifetime', db);
    await reserveEntitlementOperatingCosts('owner', 'lifetime:credit-funded', 'lifetime', db);
    const after = getBillingAccount(memory.user());
    assert.equal(reserve.targetMicros, 1_100_000); assert.equal(after.reservedCostMicros, 1_100_000);
    assert.equal(after.recognizedRevenueMicros, before.recognizedRevenueMicros);
    assert.equal(Object.keys(after.fundingLots).length, Object.keys(before.fundingLots).length);
    assert.equal(after.fundingLots[ledgerKey('base')].protectedOperatingCostMicros, 1_100_000);
});

test('released competing quota cannot erase included provider cost from repeated plan-credit caps', async t => {
    const { memory, db } = await fixture(t), acceptedAt = new Date('2026-10-20');
    await mutateBillingAccount('owner', (account, user) => {
        ensurePeriod(account, user, acceptedAt);
        reserveCost(account, user, { id: 'first-pending', retailMicros: 0, maximumCostMicros: 1000, consumedSeconds: 15, kind: 'transcription', expiresAt: acceptedAt });
        reserveCost(account, user, { id: 'second-pending', retailMicros: 10_000, maximumCostMicros: 1000, consumedSeconds: 15, kind: 'transcription', expiresAt: acceptedAt });
    }, db);
    await releasePrepaidReservation('owner', 'first-pending', db);
    await mutateBillingAccount('owner', (account, user) => settleTranscription(account, user, { id: 'second-pending', consumedSeconds: 15, allowanceSeconds: 15,
        acceptedAt, customerId: 'cus', subscriptionId: 'sub', reservationId: 'second-pending', actualCostMicros: 1000 }), db);
    const account = getBillingAccount(memory.user());
    assert.equal(account.prepaidSpentMicros, 0); assert.equal(account.fundingLots[ledgerKey('base')].costMicros, 1000);
    assert.equal(account.reservations[ledgerKey('second-pending')].unfundedCostMicros, undefined);
    const credit = Math.min(1000, Math.floor(refundableBaseMicros(getBillingAccount(memory.user())) / 10_000)); assert.equal(credit, 999);
    await reservePlanCredit('owner', 'switch-1', credit, db); await settlePlanCredit('owner', 'switch-1', true, db);
    assert.equal(Math.min(1000, Math.floor(refundableBaseMicros(getBillingAccount(memory.user())) / 10_000)), 0);
    assert.equal(getBillingAccount(memory.user()).recognizedCostMicros, 1000);
});
test('a pending retail charge cannot finance a provider attempt that might fail without customer revenue', t => {
    policy(t);
    const account = getBillingAccount({}), user = userFixture();
    account.fundingLots[ledgerKey('credit')] = { id: 'credit', reference: 'grant', source: 'stripe', kind: 'prepaid', amountMicros: 1_000_000, creditedMicros: 0, costMicros: 0, reservedCostMicros: 0, createdAt: new Date() };
    account.prepaidFundedMicros = 1_000_000;
    assert.throws(() => reserveCost(account, user, { id: 'unfunded-failure-risk', retailMicros: 1_000_000, maximumCostMicros: 1000, kind: 'transcription', expiresAt: new Date() }), OperatingFundingUnavailableError);
});

test('included processing uses the full paid base principal with zero customer wallet credit', async t => {
    const { memory, db } = await fixture(t);
    const account = getBillingAccount(memory.user()), user = memory.user(), acceptedAt = new Date('2026-10-20');
    delete account.fundingLots[ledgerKey('grant')]; account.prepaidFundedMicros = 0;
    ensurePeriod(account, user, acceptedAt);
    const reservation = reserveCost(account, user, { id: 'included', retailMicros: 0, maximumCostMicros: 6_000_000,
        kind: 'transcription', expiresAt: acceptedAt });
    assert.equal(reservation.minimumMarginBps, undefined);
    assert.equal(reservation.heldRetailMicros, 0);
    assert.equal(account.reservedCostMicros, 6_000_000);
    assert.equal(getPrepaidState({ billingAccount: account }).availableMicros, 0);
    settleTranscription(account, user, { id: 'included', consumedSeconds: 60, allowanceSeconds: 3600, acceptedAt,
        customerId: 'cus', subscriptionId: 'sub', reservationId: 'included', actualCostMicros: 5_500_000 });
    assert.equal(account.prepaidSpentMicros, 0);
    assert.equal(account.receipts[ledgerKey('included')].meterQuantity, 0);
    assert.equal(account.fundingLots[ledgerKey('base')].costMicros, 5_500_000);
    assert.equal(retainedFundingCapacity(account), 4_500_000);
    assert.equal(account.costReview, undefined);
    assert.equal(Object.keys(account.outbox).length, 0);
    assert.equal(await db.collection('billing_provider_cost_evidence').countDocuments({}), 0);
});

test('operating capacity and customer credit are independent and concurrent holds cannot overcommit paid cash', async t => {
    const { memory } = await fixture(t), account = getBillingAccount(memory.user()), user = memory.user();
    const request = { id: 'first', retailMicros: 0, maximumCostMicros: 6_000_000, kind: 'transcription', expiresAt: new Date() };
    reserveCost(account, user, request);
    assert.throws(() => reserveCost(account, user, { ...request, id: 'second', maximumCostMicros: 4_000_001 }),
        (error: unknown) => error instanceof OperatingFundingUnavailableError && error.code === 'operating_funds_unavailable');
    assert.equal(account.prepaidReservedMicros, 0);
    assert.equal(getPrepaidState({ billingAccount: account }).availableMicros, 5_000_000);
    assert.throws(() => reserveCost(account, user, { ...request, id: 'customer-shortage', retailMicros: 5_000_001, maximumCostMicros: 1 }), PrepaidFundingRequiredError);
});

test('earned recurring revenue funds actual costs above the former profit threshold without double-debiting credit', async t => {
    const { memory } = await fixture(t), account = getBillingAccount(memory.user()), user = memory.user();
    reserveCost(account, user, { id: 'overage', retailMicros: 1_000_000, maximumCostMicros: 800_000, kind: 'transcription', expiresAt: new Date() });
    assert.equal(account.prepaidReservedMicros, 1_000_000);
    settleReservation(account, 'overage', { actualCostMicros: 800_000, chargedMicros: 1_000_000, outcome: 'completed' });
    assert.equal(account.usageFunding!.recurring.revenueMicros, 1_000_000);
    assert.equal(account.usageFunding!.recurring.costMicros, 800_000);
    assert.equal(account.fundingLots[ledgerKey('base')].costMicros, 0);
    assert.equal(account.prepaidSpentMicros, 1_000_000);
    assert.equal(account.prepaidReservedMicros, 0);
    assert.equal(account.costReview, undefined);
});

test('new base receipts ignore legacy configured operating reserves', async t => {
    const { memory, db } = await fixture(t);
    process.env.MANAGED_COST_POLICY_JSON = JSON.stringify({ ...fixtureCostPolicy, version: 'large-explicit-reserve', recoveryReserveMicros: 6_000_000 });
    await creditBaseFunds('owner', { id: 'second-base', amountMicros: 10_000_000, reference: 'in_second', kind: 'base', processorFeeMicros: 300_000 }, db);
    const account = getBillingAccount(memory.user()), lot = account.fundingLots[ledgerKey('second-base')];
    assert.equal(lot.protectedOperatingCostMicros, undefined);
    assert.equal(lot.reservedCostMicros, 0);
    assert.equal(lot.costMicros, 300_000);
    assert.equal(account.reservedCostMicros, 0);
    assert.equal(retainedFundingCapacity(account), 19_700_000);
});

test('an entire prepaid processor fee reduces operating cash immediately without reducing customer credit', async t => {
    const { memory, db } = await fixture(t);
    await creditPrepaidFunds('owner', { id: 'grant', amountMicros: 5_000_000, reference: 'grant_test', source: 'stripe', processorFeeMicros: 300_000 }, db);
    const account = getBillingAccount(memory.user()), user = memory.user();
    assert.equal(unearnedPrepaidFeeMicros(account), 300_000);
    assert.equal(retainedFundingCapacity(account), 9_700_000);
    assert.equal(account.recognizedRevenueMicros, 10_000_000);
    assert.equal(account.prepaidFundedMicros, 5_000_000);
    assert.equal(getPrepaidState({ billingAccount: account }).availableMicros, 5_000_000);
    assert.throws(() => reserveCost(account, user, { id: 'ignores-deposit-fee', retailMicros: 0, maximumCostMicros: 9_700_001,
        kind: 'transcription', expiresAt: new Date() }), OperatingFundingUnavailableError);
    reserveCost(account, user, { id: 'earned-fee', retailMicros: 1_000_000, maximumCostMicros: 800_000, kind: 'transcription', expiresAt: new Date() });
    settleReservation(account, 'earned-fee', { actualCostMicros: 800_000, chargedMicros: 1_000_000, outcome: 'completed' });
    assert.equal(unearnedPrepaidFeeMicros(account), 240_000);
    assert.equal(account.recognizedCostMicros, 860_000);
    assert.equal(operatingFundingCapacity(account), 9_900_000);
    assert.equal(getPrepaidState({ billingAccount: account }).availableMicros, 4_000_000);
});

test('earned revenue cannot bypass an incurred prepaid fee when no base principal remains', t => {
    policy(t);
    const account = getBillingAccount({}), user = userFixture();
    account.prepaidFundedMicros = 5_000_000; account.prepaidSpentMicros = 1_000_000;
    account.recognizedRevenueMicros = 1_000_000; account.recognizedCostMicros = 60_000;
    account.fundingLots.deposit = { id: 'deposit', kind: 'prepaid', reference: 'cg', source: 'stripe', amountMicros: 5_000_000,
        spentMicros: 1_000_000, creditedMicros: 0, costMicros: 60_000, reservedCostMicros: 0, processorFeeMicros: 300_000,
        processorFeeRecognizedMicros: 60_000, createdAt: new Date() };
    account.usageFunding = { recurring: { revenueMicros: 1_000_000, costMicros: 60_000, reservedCostMicros: 0 },
        lifetime: { revenueMicros: 0, costMicros: 0, reservedCostMicros: 0 } };
    assert.equal(operatingFundingCapacity(account), 700_000);
    const request = { id: 'earned-only', retailMicros: 0, maximumCostMicros: 800_000, kind: 'transcription', expiresAt: new Date() };
    assert.throws(() => reserveCost(account, user, request), OperatingFundingUnavailableError);
    reserveCost(account, user, { ...request, maximumCostMicros: 700_000 });
    assert.equal(operatingFundingCapacity(account), 0);
    assert.equal(account.prepaidReservedMicros, 0);
});

test('a committed deposit fee is not reserved again when usage earns part of that deposit', t => {
    policy(t);
    const account = getBillingAccount({}), user = userFixture();
    account.prepaidFundedMicros = 5_000_000; account.recognizedRevenueMicros = 400_000;
    account.fundingLots.base = { id: 'base', kind: 'base', reference: 'paid', source: 'stripe', amountMicros: 400_000,
        creditedMicros: 0, costMicros: 0, reservedCostMicros: 0, createdAt: new Date() };
    account.fundingLots.deposit = { id: 'deposit', kind: 'prepaid', reference: 'cg', source: 'stripe', amountMicros: 5_000_000,
        creditedMicros: 0, costMicros: 0, reservedCostMicros: 0, processorFeeMicros: 300_000, processorFeeRecognizedMicros: 0, createdAt: new Date() };
    assert.equal(operatingFundingCapacity(account), 100_000);
    const row = reserveCost(account, user, { id: 'exact-cash', retailMicros: 1_000_000, maximumCostMicros: 100_000, kind: 'transcription', expiresAt: new Date() });
    assert.equal(row.processorFeeBudgetMicros, 0);
    assert.equal(account.reservedCostMicros, 100_000);
    assert.equal(operatingFundingCapacity(account), 0);
    settleReservation(account, 'exact-cash', { actualCostMicros: 100_000, chargedMicros: 1_000_000, outcome: 'completed' });
    assert.equal(account.reservedCostMicros, 0);
    assert.equal(account.recognizedCostMicros, 160_000);
    assert.equal(row.processorFeeCostMicros, 60_000);
    assert.equal(operatingFundingCapacity(account), 1_000_000);
    assert.equal(account.costReview, undefined);
});

test('late verified payment fees remain observations without a new operating review', async t => {
    const { memory, db } = await fixture(t);
    await mutateBillingAccount('owner', account => {
        const lot = account.fundingLots[ledgerKey('base')]; lot.costMicros = 9_900_000; account.recognizedCostMicros = 9_900_000;
    }, db);
    await creditPrepaidFunds('owner', { id: 'grant', amountMicros: 5_000_000, reference: 'grant_test', source: 'stripe', processorFeeMicros: 300_000 }, db);
    const account = getBillingAccount(memory.user());
    assert.equal(account.costReview, undefined);
    assert.equal(getPrepaidState({ billingAccount: account }).availableMicros, 5_000_000);
    assert.equal(operatingFundingCapacity(account), 0);
});

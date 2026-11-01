import { reserveLegacyCostFixture } from './legacy-test-support';
import { testProcessingCostEvidence } from './processing-test-support';
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { User } from '@/lib/db/types';
import type { ManagedCostPolicy } from './economics';
import { BILLING_CATALOG } from './catalog';
import { quoteUsageQuantity, type UsageTariffPair } from './usage-tariff';
import { MemoryBillingDatabase, fixtureUsageTariffs, userFixture } from './test-support';
import { creditBaseFunds, creditPrepaidFunds, getBillingAccount, getUsageFunding, ledgerKey, mutateBillingAccount, paymentFeeSchedule, putStoragePeak, reconcileUsageInvoiceRounding, reserveCost, settlePrepaidReservation, settleTranscription, operatingFundingCapacity, settleReservation } from './ledger';
import { applyProviderCostEvidence } from './provider-costs';
import { refundableBaseMicros } from './plan-credit-economics';
import { OperatingFundingUnavailableError } from './billing-errors';

const policy: ManagedCostPolicy = {
    version: 'audited-quantity-ledger-test', reviewedAt: '2026-01-01', expiresAt: '2099-01-01', paymentFeeBasisPoints: 0, paymentFixedMicros: 0,
    minimumTopupMicros: 5_000_000, recoveryReserveMicros: 1, lifetimeHostingReserveMicros: 1,
    infrastructureMicrosPerAudioMinute: 100, infrastructureMicrosPerGiB: 100, aiBundleMicrosPerAudioMinute: 100, aiBundleFixedMicros: 100,
    storageCostMicrosPerGiBMonth: 20_000, storageOperationsMicrosPerGiBMonth: 1000, stripeBillingFeeBasisPoints: 0, stripeBillingFixedMicros: 0,
    providers: { soniox: { costMicrosPerAudioMinute: 1700, fixedMicros: 0 }, gemini: { costMicrosPerAudioMinute: 5000, fixedMicros: 0 }, elevenlabs: { costMicrosPerAudioMinute: 3700, fixedMicros: 0 } },
    ...testProcessingCostEvidence(), exports: { fixedMicros: 1, perGiBMicros: 1, maximumSourceBytes: 1_000_000, recoveryReserveMicros: 1 },
    lifetimeUsage: { audioOverheadMicrosPerMinute: 10, recordingOverheadMicros: 10, storageOverheadMicrosPerGiBMonth: 100 },
};
function configure(t: TestContext) {
    const previous = process.env.MANAGED_COST_POLICY_JSON;
    process.env.MANAGED_COST_POLICY_JSON = JSON.stringify(policy);
    t.after(() => { if (previous === undefined) delete process.env.MANAGED_COST_POLICY_JSON; else process.env.MANAGED_COST_POLICY_JSON = previous; });
}
const ids = { storage: 'price_life_storage', transcription: 'price_life_audio' };
function pair(rates: Partial<Record<'storage' | 'transcription', string>> = {}): UsageTariffPair {
    return fixtureUsageTariffs('lifetime', ids, BILLING_CATALOG.version, { storage: '0.002154123456', transcription: '0.125', ...rates });
}
async function fixture(t: TestContext, overrides: Partial<User> = {}) {
    configure(t);
    const memory = new MemoryBillingDatabase();
    memory.collection('users').values.push(userFixture({ billingEntitlement: { source: 'lifetime', grantedAt: new Date() }, storageAllocation: 0,
        storageUsed: 0, transcriptionUsed: 0, transcriptionAllocation: 0, stripeSubscriptionId: 'sub_owner', stripeCurrentPeriodStart: new Date('2026-10-01'),
        billingUsageTariffs: pair(), stripeMetering: { subscriptionId: 'sub_owner', storagePriceId: ids.storage, transcriptionPriceId: ids.transcription, verifiedAt: new Date() }, ...overrides }) as unknown as Record<string, unknown>);
    const db = memory.asDb();
    await creditBaseFunds('owner', { id: 'base', amountMicros: 250_000_000, reference: 'in_lifetime', kind: 'lifetime', processorFeeMicros: 0 }, db);
    await creditPrepaidFunds('owner', { id: 'prepaid', amountMicros: 5_000_000, reference: 'grant', source: 'stripe', processorFeeMicros: 0 }, db);
    return { memory, db };
}
async function audio(memory: MemoryBillingDatabase, db: ReturnType<MemoryBillingDatabase['asDb']>, id: string, actualCostMicros = 0) {
    const tariff = memory.user().billingUsageTariffs!.transcription, acceptedAt = new Date('2026-10-20');
    await reserveLegacyCostFixture('owner', { id, maximumCostMicros: actualCostMicros, retailMicros: quoteUsageQuantity(tariff, 1).ceilingMicros,
        kind: 'transcription', usageTier: 'lifetime', tariff, expiresAt: acceptedAt }, db);
    const input = { id, consumedSeconds: 15, allowanceSeconds: 0, acceptedAt, customerId: 'cus_owner', subscriptionId: 'sub_owner',
        reservationId: id, actualCostMicros, usageTier: 'lifetime' as const, tariff };
    return { input, tariff };
}
test('Lifetime emits physical blocks and debits the frozen externally published rate once', async t => {
    const { memory, db } = await fixture(t), { input, tariff } = await audio(memory, db, 'audio', 100);
    for (let replay = 0; replay < 3; replay++) await mutateBillingAccount('owner', (account, user) => settleTranscription(account, user, input), db);
    const account = getBillingAccount(memory.user()), event = account.outbox[ledgerKey('audio')], quote = quoteUsageQuantity(tariff, 1);
    assert.equal(account.prepaidSpentMicros, quote.floorMicros); assert.equal(account.receipts[ledgerKey('audio')].meterQuantity, 1);
    assert.equal(event.value, 1); assert.equal(event.tariff!.unitPriceAtoms, tariff.unitPriceAtoms);
    assert.equal(event.eventName, BILLING_CATALOG.lifetime.meters.transcription.eventName);
    assert.equal(account.usageFunding!.recurring.revenueMicros, 0); assert.equal(account.usageFunding!.lifetime.revenueMicros, quote.floorMicros);
});
test('sub-microdollar receipts debit cumulative whole micros and partial invoices restore the one debit', async t => {
    const { memory, db } = await fixture(t, { billingUsageTariffs: pair({ transcription: '0.00006' }) });
    for (const id of ['first', 'second']) { const { input } = await audio(memory, db, id); await mutateBillingAccount('owner', (account, user) => settleTranscription(account, user, input), db); }
    let account = getBillingAccount(memory.user()); assert.equal(account.prepaidSpentMicros, 1); assert.equal(account.prepaidReservedMicros, 9999);
    for (let line = 0; line < 2; line++) await mutateBillingAccount('owner', async value => {
        const result = await reconcileUsageInvoiceRounding(value, { type: 'transcription', meterPriceId: ids.transcription, usageTier: 'lifetime',
            periodStart: 1790812800, periodEnd: 1793491200, exactAtoms: '60000000', principalMinor: 0, subject: 'owner', db });
        assert.equal(result.attributedMicros, line); assert.equal(result.deltaMicros, line ? -line : 0);
    }, db);
    account = getBillingAccount(memory.user()); assert.equal(account.prepaidSpentMicros, 0); assert.equal(account.prepaidReservedMicros, 0);
});
test('earned usage supports work across price families without reclassifying its original revenue', t => {
    configure(t); const user = userFixture({ billingEntitlement: { source: 'lifetime', grantedAt: new Date() }, billingUsageTariffs: pair() });
    const account = getBillingAccount({}); account.prepaidFundedMicros = 20_000; account.prepaidSpentMicros = 10_000; account.recognizedRevenueMicros = 10_000;
    account.fundingLots.prepaid = { id: 'prepaid', reference: 'grant', source: 'stripe', kind: 'prepaid', amountMicros: 20_000, spentMicros: 10_000, creditedMicros: 0, costMicros: 0, reservedCostMicros: 0, processorFeeMicros: 0, createdAt: new Date() };
    account.usageFunding = { recurring: { revenueMicros: 0, costMicros: 0, reservedCostMicros: 0 }, lifetime: { revenueMicros: 10_000, costMicros: 0, reservedCostMicros: 0 } };
    const request = { id: 'next', retailMicros: 0, maximumCostMicros: 10_000, kind: 'fixture', expiresAt: new Date() };
    assert.equal(reserveCost(account, user, { ...request, usageTier: 'recurring' }).usageCostBudgetMicros, 10_000);
    assert.equal(account.usageFunding.lifetime.revenueMicros, 10_000); assert.equal(account.usageFunding.recurring.revenueMicros, 0);
    const legacy = getBillingAccount({}); legacy.prepaidSpentMicros = 10_000;
    assert.equal(getUsageFunding(legacy).recurring.revenueMicros, 10_000); assert.equal(getUsageFunding(legacy).lifetime.revenueMicros, 0);
});

test('Lifetime work uses earned recurring surplus after base cash is exhausted and concurrent jobs stay funded', t => {
    configure(t); const user = userFixture({ billingEntitlement: { source: 'lifetime', grantedAt: new Date() }, billingUsageTariffs: pair() });
    const account = getBillingAccount({});
    account.prepaidFundedMicros = 50_000; account.prepaidSpentMicros = 20_000; account.recognizedRevenueMicros = 30_000; account.recognizedCostMicros = 10_000;
    account.fundingLots.base = { id: 'base', reference: 'old-principal', source: 'stripe', kind: 'base', amountMicros: 10_000,
        creditedMicros: 0, costMicros: 10_000, reservedCostMicros: 0, createdAt: new Date() };
    account.fundingLots.prepaid = { id: 'prepaid', reference: 'grant', source: 'stripe', kind: 'prepaid', amountMicros: 50_000,
        spentMicros: 20_000, creditedMicros: 0, costMicros: 0, reservedCostMicros: 0, processorFeeMicros: 0, createdAt: new Date() };
    account.usageFunding = { recurring: { revenueMicros: 20_000, costMicros: 0, reservedCostMicros: 0 }, lifetime: { revenueMicros: 0, costMicros: 0, reservedCostMicros: 0 } };
    const request = { id: 'new-lifetime', retailMicros: 1000, maximumCostMicros: 15_000, kind: 'transcription', usageTier: 'lifetime' as const, expiresAt: new Date() };
    assert.equal(reserveCost(account, user, request).usageCostBudgetMicros, 15_000);
    assert.equal(account.prepaidSpentMicros, 20_000); assert.equal(account.recognizedRevenueMicros, 30_000);
    assert.equal(account.usageFunding.recurring.revenueMicros, 20_000); assert.equal(account.usageFunding.lifetime.revenueMicros, 0);
    assert.equal(operatingFundingCapacity(account), 5000);
    assert.throws(() => reserveCost(account, user, { ...request, id: 'competing', maximumCostMicros: 10_000 }), OperatingFundingUnavailableError);
    settleReservation(account, request.id, { actualCostMicros: 12_000, chargedMicros: 1000, outcome: 'completed' });
    assert.equal(account.usageFunding.recurring.revenueMicros, 20_000); assert.equal(account.usageFunding.recurring.costMicros, 0);
    assert.equal(account.usageFunding.lifetime.revenueMicros, 1000); assert.equal(account.usageFunding.lifetime.costMicros, 12_000);
    assert.equal(account.prepaidSpentMicros, 21_000); assert.equal(account.recognizedRevenueMicros, 31_000);
    assert.equal(operatingFundingCapacity(account), 9000); assert.equal(account.costReview, undefined);
});
test('pending prepaid retail cannot finance a possible failed Lifetime attempt', t => {
    configure(t); const user = userFixture({ billingEntitlement: { source: 'lifetime', grantedAt: new Date() } }), account = getBillingAccount({});
    account.prepaidFundedMicros = 100_000;
    account.fundingLots.prepaid = { id: 'prepaid', reference: 'grant', source: 'stripe', kind: 'prepaid', amountMicros: 100_000, creditedMicros: 0, costMicros: 0, reservedCostMicros: 0, processorFeeMicros: 0, createdAt: new Date() };
    assert.throws(() => reserveCost(account, user, { id: 'failure-risk', retailMicros: 100_000, maximumCostMicros: 1000, kind: 'transcription', usageTier: 'lifetime', expiresAt: new Date() }), OperatingFundingUnavailableError);
});
test('conversion preserves charged peak and allocates only new global milliGiB units to Lifetime', async t => {
    const GiB = 1073741824, recurring = fixtureUsageTariffs('recurring');
    const { memory, db } = await fixture(t, { billingEntitlement: { source: 'subscription', grantedAt: new Date() }, storageAllocation: GiB,
        billingUsageTariffs: recurring, stripeMetering: { subscriptionId: 'sub_owner', storagePriceId: recurring.storage.priceId, transcriptionPriceId: recurring.transcription.priceId, verifiedAt: new Date() } });
    await mutateBillingAccount('owner', (account, user) => putStoragePeak(account, user, 2 * GiB, new Date('2026-10-20')), db);
    Object.assign(memory.user(), { billingEntitlement: { source: 'lifetime', grantedAt: new Date() }, storageAllocation: 0, billingUsageTariffs: pair(),
        stripeMetering: { subscriptionId: 'sub_owner', storagePriceId: ids.storage, transcriptionPriceId: ids.transcription, verifiedAt: new Date() } });
    await mutateBillingAccount('owner', (account, user) => putStoragePeak(account, user, 2 * GiB, new Date('2026-10-20')), db);
    await mutateBillingAccount('owner', (account, user) => putStoragePeak(account, user, 0, new Date('2026-10-20')), db);
    const account = getBillingAccount(memory.user()), period = account.periods[account.currentPeriodId!];
    assert.equal(period.chargeablePeakBytes, 2 * GiB); assert.equal(period.storageChargedMicros, 200_000 + quoteUsageQuantity(pair().storage, 1000).floorMicros);
    assert.deepEqual(Object.values(account.outbox).map(row => row.value), [1000, 1000]);
    assert.equal(Object.values(account.outbox).find(row => row.usageTier === 'lifetime')!.tariff!.quantityUnit, 'milliGiB');
});
test('conversion does not round one physical milliGiB twice across price families', async t => {
    const recurring = fixtureUsageTariffs('recurring');
    const { memory, db } = await fixture(t, { billingEntitlement: { source: 'subscription', grantedAt: new Date() }, billingUsageTariffs: recurring,
        stripeMetering: { subscriptionId: 'sub_owner', storagePriceId: recurring.storage.priceId, transcriptionPriceId: recurring.transcription.priceId, verifiedAt: new Date() } });
    await mutateBillingAccount('owner', (account, user) => putStoragePeak(account, user, 1, new Date('2026-10-20')), db);
    Object.assign(memory.user(), { billingEntitlement: { source: 'lifetime', grantedAt: new Date() }, billingUsageTariffs: pair(),
        stripeMetering: { subscriptionId: 'sub_owner', storagePriceId: ids.storage, transcriptionPriceId: ids.transcription, verifiedAt: new Date() } });
    await mutateBillingAccount('owner', (account, user) => putStoragePeak(account, user, 2, new Date('2026-10-20')), db);
    const events = Object.values(getBillingAccount(memory.user()).outbox);
    assert.equal(events.length, 1); assert.equal(events[0].value, 1);
});
test('zero-cent invoice rounding transfers incurred costs to retained principal with provider provenance', async t => {
    const { memory, db } = await fixture(t, { billingUsageTariffs: pair({ transcription: '0.0103' }) }), { input, tariff } = await audio(memory, db, 'tiny', 100);
    await mutateBillingAccount('owner', (account, user) => settleTranscription(account, user, input), db);
    await mutateBillingAccount('owner', account => reconcileUsageInvoiceRounding(account, { type: 'transcription', meterPriceId: tariff.priceId, usageTier: 'lifetime',
        periodStart: 1790812800, periodEnd: 1793491200, exactAtoms: quoteUsageQuantity(tariff, 1).exactAtoms, principalMinor: 0, subject: 'owner', db }), db);
    const account = getBillingAccount(memory.user());
    assert.equal(account.prepaidSpentMicros, 0); assert.equal(account.prepaidReservedMicros, 0); assert.equal(account.costReview, undefined);
    assert.equal(account.usageFunding!.lifetime.costMicros, 0); assert.equal(account.fundingLots[ledgerKey('base')].costMicros, 100);
    applyProviderCostEvidence(account, { id: 'actual:tiny', subject: 'owner', receiptId: 'tiny', provider: 'soniox', model: 'stt-async-v5', costPolicyVersion: policy.version,
        costMicros: 80, source: 'provider_usage_log', providerReference: 'provider_usage', observedAt: new Date() });
    assert.equal(account.recognizedCostMicros, 80); assert.equal(account.fundingLots[ledgerKey('base')].costMicros, 80);
});
test('Lifetime rounding can retain expense against an earned recurring surplus without replaying principal costs', async t => {
    const { memory, db } = await fixture(t, { billingUsageTariffs: pair({ transcription: '0.0103' }) }), { input, tariff } = await audio(memory, db, 'cross-family-rounding', 100);
    await mutateBillingAccount('owner', (account, user) => settleTranscription(account, user, input), db);
    await mutateBillingAccount('owner', account => {
        const base = account.fundingLots[ledgerKey('base')]; base.costMicros = base.amountMicros - 2; account.recognizedCostMicros += base.costMicros;
        account.usageFunding!.recurring.revenueMicros = 1000; account.prepaidSpentMicros += 1000; account.recognizedRevenueMicros += 1000;
        account.fundingLots[ledgerKey('prepaid')].spentMicros! += 1000;
    }, db);
    await mutateBillingAccount('owner', account => reconcileUsageInvoiceRounding(account, { type: 'transcription', meterPriceId: tariff.priceId, usageTier: 'lifetime',
        periodStart: 1790812800, periodEnd: 1793491200, exactAtoms: quoteUsageQuantity(tariff, 1).exactAtoms, principalMinor: 0, subject: 'owner', db }), db);
    const account = getBillingAccount(memory.user());
    assert.equal(account.prepaidSpentMicros, 1000); assert.equal(account.usageFunding!.recurring.revenueMicros, 1000);
    assert.equal(account.usageFunding!.lifetime.revenueMicros, 0); assert.equal(account.usageFunding!.lifetime.costMicros, 100);
    assert.equal(account.reservations[ledgerKey(input.id)].usageCostBudgetMicros, 100);
    assert.equal(operatingFundingCapacity(account), 902); assert.equal(account.costReview, undefined);
});
test('rounding reattributes an already-incurred cost at the exact remaining principal boundary', async t => {
    const { memory, db } = await fixture(t, { billingUsageTariffs: pair({ transcription: '0.0103' }) }), { input, tariff } = await audio(memory, db, 'last-principal-rounding', 100);
    await mutateBillingAccount('owner', (account, user) => settleTranscription(account, user, input), db);
    await mutateBillingAccount('owner', account => {
        const base = account.fundingLots[ledgerKey('base')]; base.costMicros = base.amountMicros - 102; account.recognizedCostMicros += base.costMicros;
    }, db);
    await mutateBillingAccount('owner', account => reconcileUsageInvoiceRounding(account, { type: 'transcription', meterPriceId: tariff.priceId, usageTier: 'lifetime',
        periodStart: 1790812800, periodEnd: 1793491200, exactAtoms: quoteUsageQuantity(tariff, 1).exactAtoms, principalMinor: 0, subject: 'owner', db }), db);
    const account = getBillingAccount(memory.user()), base = account.fundingLots[ledgerKey('base')];
    assert.equal(base.costMicros, base.amountMicros - 2); assert.equal(account.usageFunding!.lifetime.costMicros, 0);
    assert.equal(account.reservations[ledgerKey(input.id)].usageCostBudgetMicros, 0);
    assert.equal(operatingFundingCapacity(account), 2); assert.equal(account.costReview, undefined);
});
test('low-margin Lifetime usage cannot erase a verified recurring principal credit', () => {
    const account = getBillingAccount({});
    account.fundingLots.base = { id: 'base', reference: 'paid_invoice', source: 'stripe', kind: 'base', amountMicros: 1_000_000, creditedMicros: 0, costMicros: 0, reservedCostMicros: 0, createdAt: new Date() };
    account.recognizedCostMicros = 980_000; account.prepaidSpentMicros = 1_000_000;
    account.usageFunding = { recurring: { revenueMicros: 0, costMicros: 0, reservedCostMicros: 0 }, lifetime: { revenueMicros: 1_000_000, costMicros: 980_000, reservedCostMicros: 0 } };
    assert.equal(refundableBaseMicros(account), 1_000_000); account.recognizedCostMicros++; assert.equal(refundableBaseMicros(account), 0);
});
test('unknown payment evidence, grant transfers and due price changes block new spending', async t => {
    const { memory, db } = await fixture(t);
    const request = { id: 'fee-risk', retailMicros: 10_000, maximumCostMicros: 100, kind: 'transcription', usageTier: 'lifetime' as const, expiresAt: new Date() };
    memory.user().billingAccount!.fundingLots[ledgerKey('prepaid')].processorFeeMicros = undefined;
    await assert.rejects(reserveLegacyCostFixture('owner', request, db), /payment cost evidence/);
    memory.user().billingAccount!.fundingLots[ledgerKey('prepaid')].processorFeeMicros = 0;
    memory.user().billingGrantTransfer = { operationId: 'transfer', startedAt: new Date(), reason: 'price update' };
    await assert.rejects(reserveLegacyCostFixture('owner', request, db), /paused/); delete memory.user().billingGrantTransfer;
    memory.user().billingUsagePriceRollout = { id: 'rollout', state: 'scheduled', effectiveAt: new Date('2026-01-01'), targetBundleId: 'new' };
    await assert.rejects(reserveLegacyCostFixture('owner', request, db), /synchronized/);
});
test('failed Lifetime work costs retained reserves and never emits billable physical usage', async t => {
    const { memory, db } = await fixture(t);
    await reserveLegacyCostFixture('owner', { id: 'failed', retailMicros: 103, maximumCostMicros: 100, kind: 'transcription', usageTier: 'lifetime', expiresAt: new Date() }, db);
    await settlePrepaidReservation('owner', 'failed', { actualCostMicros: 100, chargedMicros: 0 }, db);
    const account = getBillingAccount(memory.user()); assert.equal(account.prepaidSpentMicros, 0); assert.equal(Object.keys(account.outbox).length, 0);
    assert.equal(account.fundingLots[ledgerKey('base')].costMicros, 100);
});
test('enrichment keeps its original fee schedule after a later cost review', async t => {
    const { memory, db } = await fixture(t), { input } = await audio(memory, db, 'original', 100), original = paymentFeeSchedule(policy);
    await mutateBillingAccount('owner', (account, user) => settleTranscription(account, user, input), db);
    delete memory.user().billingAccount!.reservations[ledgerKey('original')];
    process.env.MANAGED_COST_POLICY_JSON = JSON.stringify({ ...policy, version: 'new-reviewed-costs' });
    const reservation = await reserveLegacyCostFixture('owner', { id: 'original:summary', parentId: 'original', retailMicros: 0, maximumCostMicros: 100, kind: 'ai:summary', expiresAt: new Date() }, db);
    assert.equal(reservation.usageTier, 'lifetime'); assert.equal(reservation.paymentFeeSchedule!.costPolicyVersion, original.costPolicyVersion);
});

test('the storage LAST identity keeps its first snapshot across same-price catalog updates', async t => {
    const { memory, db } = await fixture(t), GiB = 1073741824, original = memory.user().billingUsageTariffs!.storage;
    await mutateBillingAccount('owner', (account, user) => putStoragePeak(account, user, GiB, new Date('2026-10-20')), db);
    const next = fixtureUsageTariffs('lifetime', ids, 'reviewed-next-catalog', { storage: original.unitAmountDecimal, transcription: '0.125' });
    memory.user().billingUsageTariffs = next;
    await mutateBillingAccount('owner', (account, user) => putStoragePeak(account, user, 2 * GiB, new Date('2026-10-20')), db);
    const account = getBillingAccount(memory.user()), events = Object.values(account.outbox);
    assert.equal(events.length, 1); assert.equal(events[0].value, 2000); assert.equal(events[0].tariff!.id, original.id);
    assert.equal(account.prepaidSpentMicros, quoteUsageQuantity(original, 2000).floorMicros);
});
test('rounding restores archived cost provenance before releasing earned fractional revenue', async t => {
    const { memory, db } = await fixture(t, { billingUsageTariffs: pair({ transcription: '0.0103' }) }), { input, tariff } = await audio(memory, db, 'archived', 100);
    await mutateBillingAccount('owner', (account, user) => settleTranscription(account, user, input), db);
    const row = memory.user().billingAccount!.reservations[ledgerKey('archived')];
    memory.collection('billing_financial_archive').values.push({ _id: ledgerKey('owner:reservation:archived'), authSubject: 'owner', kind: 'reservation', data: structuredClone(row) });
    delete memory.user().billingAccount!.reservations[ledgerKey('archived')];
    await mutateBillingAccount('owner', account => reconcileUsageInvoiceRounding(account, { type: 'transcription', meterPriceId: tariff.priceId, usageTier: 'lifetime',
        periodStart: 1790812800, periodEnd: 1793491200, exactAtoms: quoteUsageQuantity(tariff, 1).exactAtoms, principalMinor: 0, subject: 'owner', db }), db);
    const account = getBillingAccount(memory.user());
    assert.equal(account.costReview, undefined); assert.equal(account.fundingLots[ledgerKey('base')].costMicros, 100);
    assert.equal(account.reservations[ledgerKey('archived')].usageCostBudgetMicros, 0); assert.equal(account.reservations[ledgerKey('archived')].accountingRevision, 1);
});

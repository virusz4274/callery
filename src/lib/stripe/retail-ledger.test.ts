import test from 'node:test';
import assert from 'node:assert/strict';
import { creditBaseFunds, creditPrepaidFunds, ensureBillingPeriod, ensurePeriod, getBillingAccount, getPrepaidState, ledgerKey, mutateBillingAccount,
    putStoragePeak, reconcileUsageInvoiceRounding, releasePrepaidReservation, reservePrepaidUsage, reserveRetailUsage, reserveStorageUsage, settleIncludedTranscription,
    settleReservation, settleTranscription } from './ledger';
import { BillingSyncPendingError, PrepaidFundingRequiredError } from './billing-errors';
import { hasBlockingBillingReview, hasBlockingFinancialReview, isLegacyExpenseReview } from './financial-review';
import { fixtureUsageTariffs, MemoryBillingDatabase, userFixture } from './test-support';
import { quoteUsageQuantity } from './usage-tariff';
import { hasVerifiedMetering } from './billing-types';
import { canUseMeteredOverage } from '@/lib/access-control-common';
import { getTranscriptionAllowanceUsed } from '@/lib/transcription/quota-policy';
import { applyProviderCostEvidence, ProviderCostReviewError } from './provider-costs';

function fixture() {
    const memory = new MemoryBillingDatabase();
    memory.collection('users').values.push(userFixture({ storageUsed: 0, storageAllocation: 0, transcriptionUsed: 0,
        stripeCurrentPeriodStart: new Date('2026-10-01'), billingEntitlement: { source: 'subscription', grantedAt: new Date() },
        stripeSubscriptionId: 'sub_owner', stripeSubscriptionStatus: 'active', billingSettings: { allowOverage: true },
        stripeMetering: { subscriptionId: 'sub_owner', storagePriceId: 'price_storage', transcriptionPriceId: 'price_transcription', verifiedAt: new Date() },
    }) as unknown as Record<string, unknown>);
    return { memory, db: memory.asDb() };
}

test('new included usage needs neither a wallet, base funding principal nor provider-cost policy', async () => {
    const { memory, db } = fixture(), at = new Date('2026-10-20');
    await reservePrepaidUsage('owner', { id: 'included', retailMicros: 0, consumedSeconds: 60, includedSeconds: 60, meterQuantity: 0, kind: 'transcription', expiresAt: at }, db);
    await mutateBillingAccount('owner', (account, user) => settleTranscription(account, user, { id: 'included', reservationId: 'included',
        consumedSeconds: 60, allowanceSeconds: 3600, acceptedAt: at, customerId: 'cus_owner', subscriptionId: 'sub_owner' }), db);
    const account = getBillingAccount(memory.user());
    assert.equal(account.reservations[ledgerKey('included')].accountingMode, 'retail_only');
    assert.equal(account.reservations[ledgerKey('included')].paymentFeeSchedule, undefined);
    assert.equal(account.reservedCostMicros, 0); assert.equal(account.recognizedCostMicros, 0);
    assert.equal(account.prepaidSpentMicros, 0); assert.equal(account.prepaidReservedMicros, 0);
    assert.equal(memory.user().transcriptionUsed, 60); assert.deepEqual(account.fundingLots, {});
});

test('historical provider expense evidence cannot change a retail-only reservation', async () => {
    const { memory, db } = fixture();
    const at = new Date('2026-10-20');
    await reservePrepaidUsage('owner', { id: 'new-retail', retailMicros: 0, kind: 'transcription', expiresAt: at }, db);
    const account = getBillingAccount(memory.user());
    settleReservation(account, 'new-retail', { actualCostMicros: 0, chargedMicros: 0, outcome: 'completed' });
    const previous = structuredClone(account);
    assert.throws(() => applyProviderCostEvidence(account, { id: 'wrong-evidence', subject: 'owner', receiptId: 'new-retail',
        provider: 'gemini', model: 'test', costPolicyVersion: 'historical', costMicros: 123, source: 'provider_invoice',
        providerReference: 'external', observedAt: at }), ProviderCostReviewError);
    assert.deepEqual(account, previous);
});

test('an active subscription cannot open a renewal allowance without verified paid-service coverage', () => {
    const { memory } = fixture(), user = memory.user(), account = getBillingAccount({});
    user.billingPaidBasePeriod = { ...user.billingPaidBasePeriod!, start: new Date('2026-10-01'), end: new Date('2026-11-01') };
    const october = ensurePeriod(account, user, new Date('2026-10-20'));
    assert.equal(october.start.toISOString(), '2026-10-01T00:00:00.000Z');
    assert.throws(() => ensurePeriod(account, user, new Date('2026-11-01')), error => error instanceof BillingSyncPendingError && error.code === 'billing_sync_pending');
    assert.equal(Object.keys(account.periods).length, 1); assert.equal(account.currentPeriodId, october.id);
    assert.equal(account.prepaidReservedMicros, 0); assert.equal(user.billingRecovery, undefined);
    // A late successful callback settles its original already-opened window.
    assert.equal(ensurePeriod(account, user, new Date('2026-10-25')).id, october.id);
    user.billingPaidBasePeriod = { ...user.billingPaidBasePeriod, start: new Date('2026-11-01'), end: new Date('2026-12-01'), invoiceId: 'in_paid_renewal' };
    const november = ensurePeriod(account, user, new Date('2026-11-01'));
    assert.equal(november.consumedSeconds, 0); assert.notEqual(november.id, october.id);
});

test('paid annual service covers twelve monthly windows while Lifetime and grants need no base renewal payment', () => {
    const { memory } = fixture(), user = memory.user(), account = getBillingAccount({});
    user.stripeCurrentPeriodStart = new Date('2026-01-01');
    user.billingPaidBasePeriod = { ...user.billingPaidBasePeriod!, start: new Date('2026-01-01'), end: new Date('2027-01-01'), invoiceId: 'in_paid_annual' };
    for (let month = 0; month < 12; month++) assert.equal(ensurePeriod(account, user, new Date(Date.UTC(2026, month, 1))).consumedSeconds, 0);
    assert.equal(Object.keys(account.periods).length, 12);
    assert.throws(() => ensurePeriod(account, user, new Date('2027-01-01')), BillingSyncPendingError);
    for (const source of ['lifetime', 'admin', 'trial'] as const) {
        const other = userFixture({ billingEntitlement: { source, grantedAt: new Date() }, billingPaidBasePeriod: undefined });
        assert.doesNotThrow(() => ensurePeriod(getBillingAccount({}), other));
    }
});

test('cached paid base proof is fenced to the customer generation, subscription and base Price', () => {
    const { memory } = fixture(), user = memory.user(), acceptedAt = new Date('2026-10-20');
    for (const changes of [ { customerId: 'cus_other' }, { customerGeneration: 1 }, { subscriptionId: 'sub_other' }, { basePriceId: 'price_other' } ]) {
        const changed = { ...user, billingPaidBasePeriod: { ...user.billingPaidBasePeriod!, ...changes } };
        assert.throws(() => ensurePeriod(getBillingAccount({}), changed, acceptedAt), BillingSyncPendingError);
    }
    assert.throws(() => ensurePeriod(getBillingAccount({}), { ...user, billingPaidBasePeriod: undefined }, acceptedAt), BillingSyncPendingError);
});

test('a paid annual base expiring inside a monthly window admits paid days and pauses only new work at expiry', () => {
    const { memory } = fixture(), user = memory.user(), account = getBillingAccount({});
    user.billingPaidBasePeriod = { ...user.billingPaidBasePeriod!, start: new Date('2025-10-15'), end: new Date('2026-10-15'), invoiceId: 'in_paid_annual' };
    const before = new Date('2026-10-14');
    const period = ensurePeriod(account, user, before);
    assert.equal(period.start.toISOString(), '2026-10-01T00:00:00.000Z'); assert.equal(period.end.toISOString(), '2026-11-01T00:00:00.000Z');
    reserveRetailUsage(account, user, { id: 'accepted-before-expiry', consumedSeconds: 15, includedSeconds: 15, meterQuantity: 0,
        retailMicros: 0, kind: 'transcription', acceptedAt: before, expiresAt: period.end });
    assert.throws(() => reserveRetailUsage(account, user, { id: 'after-expiry', retailMicros: 0, kind: 'transcription',
        acceptedAt: new Date('2026-10-15'), expiresAt: period.end }), BillingSyncPendingError);
    // Saved accepted work can still settle its original tariff/window.
    settleTranscription(account, user, { id: 'accepted-before-expiry', reservationId: 'accepted-before-expiry', consumedSeconds: 15,
        acceptedAt: before, allowanceSeconds: 60, customerId: 'cus_owner', subscriptionId: 'sub_owner' });
    assert.equal(period.consumedSeconds, 15);
    user.billingPaidBasePeriod = { ...user.billingPaidBasePeriod, start: new Date('2026-10-15'), end: new Date('2027-10-15'), invoiceId: 'in_paid_annual_renewal' };
    assert.doesNotThrow(() => reserveRetailUsage(account, user, { id: 'renewed', retailMicros: 0, kind: 'transcription',
        acceptedAt: new Date('2026-10-16'), expiresAt: period.end }));
    assert.equal(Object.keys(account.periods).length, 1); assert.equal(period.consumedSeconds, 15);
});

test('concurrent retail-only reservations cannot overspend confirmed prepaid deposits', async () => {
    const { memory, db } = fixture();
    await creditPrepaidFunds('owner', { id: 'topup', amountMicros: 50_000, source: 'stripe', reference: 'grant_topup', processorFeeMicros: 300_000 }, db);
    const input = { retailMicros: 10_000, kind: 'transcription', expiresAt: new Date() };
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, n) => reservePrepaidUsage('owner', { id: `r${n}`, ...input }, db)));
    assert.equal(results.filter(row => row.status === 'fulfilled').length, 5);
    assert.equal(getPrepaidState(memory.user()).availableMicros, 0);
    assert.equal(memory.user().billingAccount?.costReview, undefined);
    assert.equal(memory.user().billingAccount?.reservedCostMicros, 0);
    await releasePrepaidReservation('owner', 'r0', db); await releasePrepaidReservation('owner', 'r0', db);
    assert.equal(getPrepaidState(memory.user()).availableMicros, 10_000);
    await assert.rejects(reservePrepaidUsage('owner', { id: 'too-large', ...input, retailMicros: 20_000 }, db), PrepaidFundingRequiredError);
});

test('retail settlement retains the partial-overage minimum once and never spends credit on provider expenses', async () => {
    const { memory, db } = fixture(), at = new Date('2026-10-20');
    await creditPrepaidFunds('owner', { id: 'topup', amountMicros: 20_000, source: 'stripe', reference: 'grant_topup' }, db);
    await reservePrepaidUsage('owner', { id: 'audio', consumedSeconds: 60, includedSeconds: 45, meterQuantity: 4, retailMicros: 10_000, kind: 'transcription', expiresAt: at }, db);
    const input = { id: 'audio', reservationId: 'audio', consumedSeconds: 60, allowanceSeconds: 45, acceptedAt: at,
        customerId: 'cus_owner', subscriptionId: 'sub_owner' };
    for (let count = 0; count < 3; count++) await mutateBillingAccount('owner', (account, user) => settleTranscription(account, user, input), db);
    const account = getBillingAccount(memory.user());
    assert.equal(account.prepaidSpentMicros, 10_000); assert.equal(account.receipts[ledgerKey('audio')].meterBlocks, 4);
    assert.equal(memory.user().transcriptionUsed, 60); assert.equal(Object.keys(account.outbox).length, 1);
    assert.equal(account.recognizedCostMicros, 0); assert.equal(account.usageFunding?.recurring.revenueMicros, 10_000);
    assert.equal(account.periods[account.currentPeriodId!].includedConsumedSeconds, 45);
    const other = getBillingAccount({}); reserveRetailUsage(other, memory.user(), { id: 'zero', retailMicros: 0, kind: 'transcription', expiresAt: at });
    assert.throws(() => settleReservation(other, 'zero', { chargedMicros: 0, actualCostMicros: 1 }), /cannot settle provider expenses/);
});

test('out-of-order completion consumes frozen allowance and retail quantities without increasing either charge', async () => {
    const { memory, db } = fixture(), acceptedAt = new Date('2026-10-20');
    await creditPrepaidFunds('owner', { id: 'topup', amountMicros: 50_000, source: 'stripe', reference: 'grant_topup' }, db);
    await mutateBillingAccount('owner', (account, user) => {
        const period = ensurePeriod(account, user, acceptedAt); period.includedConsumedSeconds = 0;
        reserveRetailUsage(account, user, { id: 'first', periodId: period.id, consumedSeconds: 60, includedSeconds: 60, meterQuantity: 0,
            retailMicros: 0, kind: 'transcription', expiresAt: acceptedAt });
        reserveRetailUsage(account, user, { id: 'second', periodId: period.id, consumedSeconds: 60, includedSeconds: 0, meterQuantity: 4,
            retailMicros: 10_000, kind: 'transcription', expiresAt: acceptedAt });
    }, db);
    for (const id of ['second', 'first']) await mutateBillingAccount('owner', (account, user) => settleTranscription(account, user, {
        id, reservationId: id, consumedSeconds: 60, allowanceSeconds: 60, acceptedAt, customerId: 'cus_owner', subscriptionId: 'sub_owner',
    }), db);
    const account = getBillingAccount(memory.user()), period = account.periods[account.currentPeriodId!];
    assert.equal(account.receipts[ledgerKey('first')].chargedMicros, 0); assert.equal(account.receipts[ledgerKey('second')].chargedMicros, 10_000);
    assert.equal(account.prepaidSpentMicros, 10_000); assert.equal(account.prepaidReservedMicros, 0);
    assert.equal(period.consumedSeconds, 120); assert.equal(period.includedConsumedSeconds, 60);
});

test('failed reserved allowance returns to future jobs without repricing an already completed overage receipt', async () => {
    const { memory, db } = fixture(), acceptedAt = new Date('2026-10-20');
    await creditPrepaidFunds('owner', { id: 'topup', amountMicros: 50_000, source: 'stripe', reference: 'grant_topup' }, db);
    await mutateBillingAccount('owner', (account, user) => {
        const period = ensurePeriod(account, user, acceptedAt); period.includedConsumedSeconds = 0;
        reserveRetailUsage(account, user, { id: 'failed-first', periodId: period.id, consumedSeconds: 60, includedSeconds: 60, meterQuantity: 0,
            retailMicros: 0, kind: 'transcription', expiresAt: acceptedAt });
        reserveRetailUsage(account, user, { id: 'paid-second', periodId: period.id, consumedSeconds: 60, includedSeconds: 0, meterQuantity: 4,
            retailMicros: 10_000, kind: 'transcription', expiresAt: acceptedAt });
    }, db);
    await mutateBillingAccount('owner', (account, user) => settleTranscription(account, user, { id: 'paid-second', reservationId: 'paid-second',
        consumedSeconds: 60, allowanceSeconds: 60, acceptedAt, customerId: 'cus_owner', subscriptionId: 'sub_owner' }), db);
    await releasePrepaidReservation('owner', 'failed-first', db);
    assert.equal(getTranscriptionAllowanceUsed(memory.user()), 0);
    await mutateBillingAccount('owner', (account, user) => {
        const period = account.periods[account.currentPeriodId!];
        assert.equal(period.includedConsumedSeconds, 0);
        assert.equal(Object.values(account.reservations).filter(row => row.state === 'reserved').reduce((sum, row) => sum + (row.includedSeconds || 0), 0), 0);
        reserveRetailUsage(account, user, { id: 'future', periodId: period.id, consumedSeconds: 60, includedSeconds: 60, meterQuantity: 0,
            retailMicros: 0, kind: 'transcription', expiresAt: acceptedAt });
        settleTranscription(account, user, { id: 'future', reservationId: 'future', consumedSeconds: 60, allowanceSeconds: 60,
            acceptedAt, customerId: 'cus_owner', subscriptionId: 'sub_owner' });
    }, db);
    const account = getBillingAccount(memory.user()), period = account.periods[account.currentPeriodId!];
    assert.equal(account.prepaidSpentMicros, 10_000); assert.equal(period.includedConsumedSeconds, 60); assert.equal(period.consumedSeconds, 120);
    assert.equal(account.receipts[ledgerKey('paid-second')].chargedMicros, 10_000); assert.equal(account.receipts[ledgerKey('future')].chargedMicros, 0);
});

test('one-time included quota settles atomically once without monthly periods or meters', async () => {
    const { memory, db } = fixture();
    memory.user().billingEntitlement = { source: 'trial', grantedAt: new Date('2026-09-25') };
    memory.user().trialEndsAt = new Date('2026-10-25');
    memory.user().transcriptionUsed = 45;
    const acceptedAt = new Date('2026-10-20');
    await reservePrepaidUsage('owner', { id: 'trial-audio', consumedSeconds: 15, includedSeconds: 15, meterQuantity: 0, retailMicros: 0, kind: 'transcription', expiresAt: acceptedAt }, db);
    for (let count = 0; count < 3; count++) await mutateBillingAccount('owner', (account, user) => settleIncludedTranscription(account, user, {
        id: 'trial-audio', reservationId: 'trial-audio', consumedSeconds: 15, acceptedAt,
    }), db);
    const account = getBillingAccount(memory.user());
    assert.equal(memory.user().transcriptionUsed, 60); assert.deepEqual(account.periods, {}); assert.deepEqual(account.outbox, {});
    assert.equal(account.receipts[ledgerKey('trial-audio')].periodId, 'included:owner');
});

test('noncustomer callback replay cannot replace its cumulative counter with a historical recurring period', async () => {
    const { memory, db } = fixture(), account = getBillingAccount({});
    account.currentPeriodId = 'old';
    account.periods.old = { id: 'old', start: new Date('2026-09-01'), end: new Date('2026-10-01'), consumedSeconds: 500,
        storagePeakBytes: 0, chargeablePeakBytes: 0, storageCostMicros: 0, storageBilledMilliGiB: 0, storageChargedMicros: 0 };
    memory.user().billingAccount = account; memory.user().transcriptionUsed = 600;
    const acceptedAt = new Date('2026-10-20');
    await reservePrepaidUsage('owner', { id: 'included', consumedSeconds: 15, includedSeconds: 15, meterQuantity: 0, retailMicros: 0, kind: 'transcription', expiresAt: acceptedAt }, db);
    const input = { id: 'included', reservationId: 'included', consumedSeconds: 15, acceptedAt };
    for (let count = 0; count < 3; count++) await mutateBillingAccount('owner', (latest, user) => settleIncludedTranscription(latest, user, input), db);
    assert.equal(memory.user().transcriptionUsed, 615); assert.equal(memory.user().billingAccount?.periods.old.consumedSeconds, 500);
});

test('retail-only Lifetime fractions accumulate once and invoice rounding restores exactly the earned debit', async () => {
    const { memory, db } = fixture(), acceptedAt = new Date('2026-10-20');
    const pair = fixtureUsageTariffs('lifetime', { transcription: 'price_life_audio', storage: 'price_life_storage' }, 'fractional', { transcription: '0.00006' });
    Object.assign(memory.user(), { billingEntitlement: { source: 'lifetime', grantedAt: acceptedAt }, billingUsageTariffs: pair,
        stripeMetering: { subscriptionId: 'sub_owner', storagePriceId: pair.storage.priceId, transcriptionPriceId: pair.transcription.priceId, verifiedAt: acceptedAt } });
    await creditPrepaidFunds('owner', { id: 'topup', amountMicros: 20_000, source: 'stripe', reference: 'grant_topup' }, db);
    for (const id of ['first', 'second']) {
        await reservePrepaidUsage('owner', { id, consumedSeconds: 15, includedSeconds: 0, meterQuantity: 1, retailMicros: quoteUsageQuantity(pair.transcription, 1).ceilingMicros,
            tariff: pair.transcription, kind: 'transcription', expiresAt: acceptedAt }, db);
        await mutateBillingAccount('owner', (latest, user) => settleTranscription(latest, user, { id, reservationId: id, consumedSeconds: 15,
            allowanceSeconds: 0, acceptedAt, customerId: 'cus_owner', subscriptionId: 'sub_owner' }), db);
    }
    assert.equal(memory.user().billingAccount?.prepaidSpentMicros, 1);
    assert.equal(memory.user().billingAccount?.prepaidReservedMicros, 9999);
    for (let n = 0; n < 2; n++) await mutateBillingAccount('owner', latest => reconcileUsageInvoiceRounding(latest, {
        type: 'transcription', meterPriceId: pair.transcription.priceId, usageTier: 'lifetime', periodStart: 1790812800,
        periodEnd: 1793491200, exactAtoms: quoteUsageQuantity(pair.transcription, 1).exactAtoms, principalMinor: 0,
    }), db);
    const final = getBillingAccount(memory.user());
    assert.equal(final.prepaidSpentMicros, 0); assert.equal(final.prepaidReservedMicros, 0); assert.equal(final.costReview, undefined);
    assert.equal(final.reservedCostMicros, 0); assert.equal(final.recognizedCostMicros, 0);
});

test('new storage holds and retained baselines use retail prices without cost policy or monetary overhead', async () => {
    const { memory, db } = fixture(), GiB = 1073741824;
    await creditPrepaidFunds('owner', { id: 'topup', amountMicros: 1_000_000, source: 'stripe', reference: 'grant_topup' }, db);
    const upload = await reserveStorageUsage('owner', { id: 'upload', projectedStoredBytes: GiB }, db);
    assert.equal(upload.accountingMode, 'retail_only'); assert.equal(upload.maximumCostMicros, 0);
    await releasePrepaidReservation('owner', upload.id, db);
    await mutateBillingAccount('owner', (account, user) => putStoragePeak(account, user, GiB, new Date('2026-10-20')), db);
    await mutateBillingAccount('owner', (account, user) => putStoragePeak(account, user, 0, new Date('2026-10-20')), db);
    let account = getBillingAccount(memory.user()), period = account.periods[account.currentPeriodId!];
    assert.equal(period.storageCostMicros, 0); assert.equal(period.storageChargedMicros, 200_000); assert.equal(period.chargeablePeakBytes, GiB);
    assert.equal(account.reservedCostMicros, 0);
    memory.user().storageUsed = GiB;
    await ensureBillingPeriod('owner', db);
    account = getBillingAccount(memory.user()); period = account.periods[account.currentPeriodId!];
    assert.equal(period.storageChargedMicros, 200_000); assert.equal(account.costReview, undefined);
});

test('funding credits record paid principal and actual fees without hidden operating reserves', async () => {
    const { memory, db } = fixture();
    await creditBaseFunds('owner', { id: 'base', amountMicros: 10_000_000, kind: 'base', reference: 'in_base', processorFeeMicros: 300_000 }, db);
    await creditBaseFunds('owner', { id: 'base', amountMicros: 10_000_000, kind: 'base', reference: 'in_base', processorFeeMicros: 300_000 }, db);
    await creditPrepaidFunds('owner', { id: 'topup', amountMicros: 5_000_000, source: 'stripe', reference: 'grant_topup', processorFeeMicros: 300_000 }, db);
    const account = getBillingAccount(memory.user());
    assert.equal(account.reservedCostMicros, 0); assert.equal(account.fundingLots[ledgerKey('base')].protectedOperatingCostMicros, undefined);
    assert.equal(account.recognizedCostMicros, 300_000); assert.equal(account.recognizedRevenueMicros, 10_000_000);
    assert.equal(getPrepaidState(memory.user()).availableMicros, 5_000_000);
});

test('legacy expense-only reviews cannot block new usage, while reversals and unknown reviews do', () => {
    const { memory } = fixture(), user = memory.user();
    const account = getBillingAccount({});
    account.costReview = { reason: 'provider_cost_exceeded_accepted_cap', evidenceId: 'old', at: new Date() };
    assert.equal(isLegacyExpenseReview(account.costReview), true); assert.equal(hasBlockingFinancialReview(account), false);
    assert.doesNotThrow(() => reserveRetailUsage(account, user, { id: 'new', retailMicros: 0, kind: 'transcription', expiresAt: new Date() }));
    for (const reason of ['prepaid_payment_reversed', 'unrecognized_review_reason']) {
        account.costReview = { reason, evidenceId: 'financial', at: new Date() };
        assert.equal(hasBlockingFinancialReview(account), true);
        assert.throws(() => reserveRetailUsage(account, user, { id: `blocked:${reason}`, retailMicros: 0, kind: 'transcription', expiresAt: new Date() }), /billing is reviewed/);
    }
});

test('a historical provider evidence review does not invalidate metering while payment and meter reviews still do', () => {
    const { memory } = fixture(), user = memory.user(), account = getBillingAccount({});
    user.billingReview = { reason: 'provider_cost_evidence_requires_review', createdAt: new Date() };
    assert.equal(hasBlockingBillingReview(user.billingReview), false); assert.equal(hasVerifiedMetering(user), true);
    assert.equal(canUseMeteredOverage(user), true);
    assert.doesNotThrow(() => reserveRetailUsage(account, user, { id: 'new', retailMicros: 0, kind: 'transcription', expiresAt: new Date() }));
    for (const reason of ['meter_items_mismatch', 'payment_refunded', 'unknown_review']) {
        user.billingReview = { reason, createdAt: new Date() };
        assert.equal(hasBlockingBillingReview(user.billingReview), true); assert.equal(hasVerifiedMetering(user), false);
        assert.equal(canUseMeteredOverage(user), false);
        assert.throws(() => reserveRetailUsage(account, user, { id: reason, retailMicros: 0, kind: 'transcription', expiresAt: new Date() }), /billing is reviewed/);
    }
});

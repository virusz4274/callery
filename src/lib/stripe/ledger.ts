import { createHash } from 'node:crypto';
import type { Db, AnyBulkWriteOperation } from 'mongodb';
import type Stripe from 'stripe';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { User } from '@/lib/db/types';
import { archiveManagedCostPolicy, managedCostPolicyFingerprint } from './cost-schedule';
import { getManagedCostPolicy, type ManagedCostPolicy } from './economics';
import { BILLING_CATALOG, storageMilliGiB, usagePricingTier, type UsagePricingTier } from './catalog';
import { accumulateUsageCharge, applyUsageInvoiceAmount, assertUsageTariff, createUsageAmountAccumulator, minimumBillableQuantity, nonnegativeAtoms, quoteUsageQuantity, sameUsageTariffRate, usageRoundingReserve, type UsageAmountAccumulator, type UsageTariffSnapshot } from './usage-tariff';
import { BillingSyncPendingError, OperatingFundingUnavailableError, PendingPlanCreditBlocksUsageError, PrepaidFundingRequiredError } from './billing-errors';
import { hasVerifiedMetering, sourcePlanUsableWhileAwaitingPayment } from './billing-types';
import type { ProcessingBudgetSnapshot } from './legacy-processing-budget';
import type { ExecutionPolicySnapshot } from './execution-policy';
import { hasBlockingBillingReview, hasBlockingFinancialReview } from './financial-review';
import { effectiveBillingEntitlementSource } from './entitlement-source';

/** All monetary values are integer USD microdollars (1 USD = 1,000,000 micros). */
export interface FundingLot { id: string; reference: string; source: string; kind: 'prepaid' | 'base' | 'lifetime'; amountMicros: number; creditedMicros: number; spentMicros?: number; revokedMicros?: number; reversalReceipts?: string[]; protectedOperatingCostMicros?: number; processorFeeMicros?: number; processorFeeRecognizedMicros?: number; costMicros: number; reservedCostMicros: number; createdAt: Date }
interface ReservationUsageFields {
    id: string; parentId?: string; kind: string; retailMicros: number; heldRetailMicros?: number;
    consumedSeconds?: number; includedSeconds?: number; meterQuantity?: number; periodId?: string;
    expiresAt: Date; createdAt: Date; state: 'reserved' | 'settled' | 'released';
    actualCostMicros?: number; chargedMicros?: number; outcome?: 'completed' | 'unknown';
    accountingRevision?: number; usageTier?: UsagePricingTier; tariff?: UsageTariffSnapshot;
}
interface LegacyExpenseFields {
    costPolicyVersion?: string; costPolicyFingerprint?: string;
    processorFeeBudgetMicros?: number; processorFeeCostMicros?: number;
    costBasis?: 'committed_cap' | 'provider_verified' | 'verified'; costEvidenceId?: string;
    costAllocations?: Record<string, number>; usageCostBudgetMicros?: number;
    fundingBasis?: 'earned_revenue'; unfundedCostMicros?: number; minimumMarginBps?: number;
    paymentFeeSchedule?: PaymentFeeSchedule; processingChildren?: Record<string, number>;
    processingBudget?: ProcessingBudgetSnapshot;
}
/** New customer usage holds cannot carry provider-expense commitments. Zero-valued
 * compatibility fields keep persisted receipts readable by historical reducers. */
export type RetailUsageReservation = ReservationUsageFields & {
    accountingMode: 'retail_only'; executionPolicy?: ExecutionPolicySnapshot;
    maximumCostMicros: 0; actualCostMicros?: 0; allocations: Record<string, never>;
} & { [K in keyof LegacyExpenseFields]?: never };
/** Accepted historical expense evidence; only legacy recovery may manipulate it. */
export interface LegacyExpenseReservation extends ReservationUsageFields, LegacyExpenseFields {
    accountingMode?: undefined; executionPolicy?: never;
    maximumCostMicros: number; allocations: Record<string, number>;
}
export type CostReservation = RetailUsageReservation | LegacyExpenseReservation;

export interface StoragePricingSegment { tier: UsagePricingTier; meterPriceId?: string; chargeablePeakBytes: number; meterValue: number; chargedMicros: number; overheadCostMicros?: number; billingFeeCostMicros?: number; tariff: UsageTariffSnapshot }
export interface PaymentFeeSchedule { costPolicyVersion: string; costPolicyFingerprint: string; expiresAt: string; paymentFeeBasisPoints: number; paymentFixedMicros: number; minimumTopupMicros: number }
export interface UsagePeriod { id: string; start: Date; end: Date; consumedSeconds: number; includedConsumedSeconds?: number; storagePeakBytes: number; chargeablePeakBytes: number; storageCostMicros: number; storageBilledMilliGiB: number; storageChargedMicros: number; transcriptionChargedMicros?: number; storageRoundingMicros?: number; transcriptionRoundingMicros?: number; tariffVersion?: string; storageMeterPriceId?: string; transcriptionMeterPriceId?: string; storageSegments?: Record<string, StoragePricingSegment>; usageAmounts?: Record<string, UsageAmountAccumulator>; archiveHydrated?: boolean }
export interface LedgerOutbox { id: string; subject: string; customerId: string; subscriptionId: string; type: 'storage' | 'transcription'; value: number; timestamp: number; periodId: string; periodStart: Date; periodEnd: Date; revision: number; tariffVersion: string; meterPriceId?: string; usageTier?: UsagePricingTier; eventName?: string; unitAmountMicros?: number; tariff?: UsageTariffSnapshot }
export interface UsageSettlement { id: string; consumedSeconds: number; includedSeconds?: number; meterBlocks: number; chargedMicros: number; acceptedAt: Date; periodId: string; committedCostMicros?: number; usageTier?: UsagePricingTier; meterQuantity?: number; exactChargeAtoms?: string; tariff?: UsageTariffSnapshot; paymentFeeSchedule?: PaymentFeeSchedule }
export interface UsageFundingCohort { revenueMicros: number; costMicros: number; reservedCostMicros: number }
export interface BillingAccount {
    version: 2; revision: number; prepaidFundedMicros: number; prepaidSpentMicros: number; prepaidReservedMicros: number;
    recognizedRevenueMicros: number; recognizedCostMicros: number; reservedCostMicros: number;
    fundingLots: Record<string, FundingLot>; reservations: Record<string, CostReservation>; periods: Record<string, UsagePeriod>;
    currentPeriodId?: string; usageAnchorDay?: number; outbox: Record<string, LedgerOutbox>; receipts: Record<string, UsageSettlement>;
    planCreditReservations?: Record<string, { id: string; amountMicros: number; allocations: Record<string, number>; state: 'reserved' | 'applied' | 'released'; redeemedMicros?: number; redeemedAllocations?: Record<string, number>; redemptionReceipts?: Record<string, number> }>;
    entitlementOperatingReservations?: Record<string, { id: string; kind: 'base' | 'lifetime'; targetMicros: number; additionalMicros: number; allocations: Record<string, number>; createdAt: Date }>;
    costReview?: { reason: string; evidenceId: string; at: Date };
    invoiceReconciliations?: Record<string, { invoiceId: string; lineId: string; deltaMicros: number; grantDebitsMinor: number; at: Date; exactAtoms?: string; attributedMicros?: number }>;
    usageFunding?: Record<UsagePricingTier, UsageFundingCohort>;
}
export type LedgerUser = User & { billingAccount?: BillingAccount; billingOperation?: unknown };
export const ledgerKey = (id: string) => createHash('sha256').update(id).digest('hex');
export const money = (value: number) => { if (!Number.isSafeInteger(value) || value < 0) throw new Error('Amounts must be nonnegative integer USD microdollars.'); return value; };
export function paymentFeeSchedule(policy: ManagedCostPolicy = getManagedCostPolicy()): PaymentFeeSchedule {
    return { costPolicyVersion: policy.version, costPolicyFingerprint: managedCostPolicyFingerprint(policy), expiresAt: policy.expiresAt,
        paymentFeeBasisPoints: policy.paymentFeeBasisPoints, paymentFixedMicros: policy.paymentFixedMicros, minimumTopupMicros: Math.min(policy.minimumTopupMicros, 5_000_000) };
}
function activeUsageTariff(user: User, kind: 'storage' | 'transcription'): UsageTariffSnapshot {
    const tariff = user.billingUsageTariffs?.[kind];
    if (!tariff) throw new Error('Publish and synchronize the account usage tariff before accepting work.');
    assertUsageTariff(tariff);
    const expectedPrice = kind === 'storage' ? user.stripeMetering?.storagePriceId : user.stripeMetering?.transcriptionPriceId;
    if (tariff.kind !== kind || tariff.usageTier !== usagePricingTier(user) || tariff.priceId !== expectedPrice) throw new Error('The active usage tariff does not match its verified subscription.');
    return tariff;
}
function usageAmountBucket(period: UsagePeriod, tariff: UsageTariffSnapshot): UsageAmountAccumulator {
    period.usageAmounts ||= {};
    const key = ledgerKey(`${tariff.kind}:${tariff.priceId}`), previous = period.usageAmounts[key];
    if (previous) {
        if (!sameUsageTariffRate(previous.tariff, tariff)) throw new Error('An immutable usage price changed inside its accounting window.');
        return previous;
    }
    return period.usageAmounts[key] = createUsageAmountAccumulator(tariff);
}
export function getBillingAccount(user: Pick<LedgerUser, 'billingAccount'>): BillingAccount {
    return user.billingAccount ? structuredClone(user.billingAccount) : { version: 2, revision: 0,
        prepaidFundedMicros: 0, prepaidSpentMicros: 0, prepaidReservedMicros: 0, recognizedRevenueMicros: 0, recognizedCostMicros: 0, reservedCostMicros: 0,
        fundingLots: {}, reservations: {}, periods: {}, outbox: {}, receipts: {} };
}
export function getPrepaidState(user: Pick<LedgerUser, 'billingAccount'>) {
    const account = getBillingAccount(user);
    return { fundedMicros: account.prepaidFundedMicros, spentMicros: account.prepaidSpentMicros, reservedMicros: account.prepaidReservedMicros,
        availableMicros: Math.max(0, account.prepaidFundedMicros - account.prepaidSpentMicros - account.prepaidReservedMicros) };
}
export function getUsageFunding(account: BillingAccount): Record<UsagePricingTier, UsageFundingCohort> {
    if (!account.usageFunding) {
        const base = Object.values(account.fundingLots).filter(lot => lot.kind !== 'prepaid');
        // Legacy earned usage belongs to the original recurring tariff. It never
        // moves into a different funding cohort merely because an account converts.
        account.usageFunding = {
            recurring: { revenueMicros: account.prepaidSpentMicros,
                costMicros: Math.max(0, account.recognizedCostMicros - base.reduce((sum, lot) => sum + lot.costMicros, 0)),
                reservedCostMicros: Math.max(0, account.reservedCostMicros - base.reduce((sum, lot) => sum + lot.reservedCostMicros, 0)) },
            lifetime: { revenueMicros: 0, costMicros: 0, reservedCostMicros: 0 },
        };
    }
    return account.usageFunding;
}
/** Earned retail revenue can fund costs in full; profit targets are advisory. */
export const usageCostLimit = (revenueMicros: number, _tier?: UsagePricingTier) => money(revenueMicros);
/** Cash is shared across this customer's earned revenue; cohort revenue and
 * actual work expenses keep their original attribution for reporting. */
export function earnedUsageFundingBalance(account: BillingAccount): number {
    return Object.values(getUsageFunding(account)).reduce((sum, cohort) => sum + cohort.revenueMicros - cohort.costMicros - cohort.reservedCostMicros, 0);
}
export const earnedUsageFundingCapacity = (account: BillingAccount) => Math.max(0, earnedUsageFundingBalance(account));
export const retainedLotCapacity = (lot: FundingLot) => Math.max(0, lot.amountMicros - lot.creditedMicros - lot.costMicros - lot.reservedCostMicros);
/** Stripe charges a deposit's whole processor fee before its retail is earned.
 * Keep the still-unallocated portion as an operating obligation, never wallet value. */
export function unearnedPrepaidFeeMicros(account: { fundingLots: Record<string, { kind: string; processorFeeMicros?: number; processorFeeRecognizedMicros?: number; costMicros?: number }> }): number {
    return Object.values(account.fundingLots).filter(lot => lot.kind === 'prepaid').reduce((sum, lot) =>
        sum + Math.max(0, (lot.processorFeeMicros || 0) - (lot.processorFeeRecognizedMicros ?? lot.costMicros ?? 0)), 0);
}
/** Every incurred fee and cash commitment counts once, including expenses whose
 * matching retail deposit is still an unearned customer liability. */
function operatingFundingBalance(account: BillingAccount): number {
    const principal = Object.values(account.fundingLots).filter(lot => lot.kind !== 'prepaid').reduce((sum, lot) =>
        sum + lot.amountMicros - lot.creditedMicros - lot.costMicros - lot.reservedCostMicros, 0);
    return principal + earnedUsageFundingBalance(account) - unearnedPrepaidFeeMicros(account);
}
export const operatingFundingCapacity = (account: BillingAccount) => Math.max(0, operatingFundingBalance(account));
function retainedPrincipalAfterPrepaidFees(account: BillingAccount): number {
    const principal = Object.values(account.fundingLots).filter(lot => lot.kind !== 'prepaid').reduce((sum, lot) =>
        sum + lot.amountMicros - lot.creditedMicros - lot.costMicros - lot.reservedCostMicros, 0);
    return Math.max(0, principal - unearnedPrepaidFeeMicros(account));
}
export function retainedFundingCapacity(account: BillingAccount): number {
    const retained = Object.values(account.fundingLots).filter(lot => lot.kind !== 'prepaid').reduce((sum, lot) => sum + retainedLotCapacity(lot), 0);
    return Math.min(retained, operatingFundingCapacity(account));
}
/** Inspection only: undo this still-unredeemed hold on a clone, never grant credit. */
export function accountWithoutPendingPlanCredit(account: BillingAccount, operationId: string): BillingAccount | null {
    const reservation = account.planCreditReservations?.[ledgerKey(operationId)];
    if (!reservation || reservation.id !== operationId || reservation.state !== 'reserved'
        || !Number.isSafeInteger(reservation.amountMicros) || reservation.amountMicros <= 0 || reservation.redeemedMicros) return null;
    const copy = structuredClone(account);
    let released = 0;
    for (const [id, amount] of Object.entries(reservation.allocations)) {
        const lot = copy.fundingLots[id];
        if (!lot || lot.kind !== 'base' || !Number.isSafeInteger(amount) || amount < 0
            || !Number.isSafeInteger(lot.creditedMicros) || lot.creditedMicros < amount
            || (reservation.redeemedAllocations?.[id] || 0) !== 0) return null;
        lot.creditedMicros -= amount; released += amount;
    }
    if (released !== reservation.amountMicros) return null;
    copy.planCreditReservations![ledgerKey(operationId)].state = 'released';
    return copy;
}
export function capacityWithoutPendingPlanCredit(account: BillingAccount, operationId: string): number | null {
    const copy = accountWithoutPendingPlanCredit(account, operationId);
    return copy ? retainedFundingCapacity(copy) : null;
}
/** One document CAS is compatible with standalone MongoDB; the callback must have no external side effects. */
export async function mutateBillingAccount<T>(subject: string, change: (account: BillingAccount, user: LedgerUser, db: Db) => T | Promise<T>, database?: Db): Promise<T> {
    const db = database || await getMongoDb();
    for (let attempt = 0; attempt < 24; attempt++) {
        const active = await db.collection<LedgerUser>(Collections.USERS).findOne({ authSubject: subject });
        const collection = active ? Collections.USERS : 'billing_deleted_accounts';
        const user = active || await db.collection<LedgerUser>(collection).findOne({ authSubject: subject });
        if (!user) throw new Error('Billing account unavailable.');
        const originalTranscriptionUsed = user.transcriptionUsed;
        const account = getBillingAccount(user);
        const originalPeriodId = account.currentPeriodId;
        const originalPeriodConsumed = originalPeriodId ? account.periods[originalPeriodId]?.consumedSeconds : undefined;
        // Admission and lifecycle updates share this document, but lifecycle
        // writes do not necessarily increment the ledger revision. Recheck every
        // authority used by admission so a new hold, revocation or tariff wins.
        const authority = user as unknown as Record<string, unknown>;
        const admissionFence = Object.fromEntries(['storageUsed', 'billingOperation', 'stripeCustomerId', 'stripeCustomerGeneration',
            'stripeSubscriptionId', 'stripeSubscriptionStatus', 'stripeMetering', 'stripeCurrentPeriodStart', 'stripeCurrentPeriodEnd',
            'billingCatalogVersion', 'billingUsageCatalogVersion', 'billingUsageTariffs', 'billingEntitlement', 'billingGrantTransfer',
            'billingUsagePriceRollout', 'billingSchedule', 'billingPaidBasePeriod', 'billingReview', 'stripePaymentIssues', 'disabled', 'softDelete', 'billingSettings',
            'storageAllocation', 'transcriptionAllocation', 'transcriptionUsed'].map(field => [field, authority[field] === undefined ? { $exists: false } : structuredClone(authority[field])]));
        await compactAccount(account, subject, db);
        const result = await change(account, user, db);
        const revision = account.revision;
        account.revision++;
        const updated = await db.collection<LedgerUser>(collection).updateOne({ _id: user._id,
            ...(user.billingAccount ? { 'billingAccount.revision': revision } : { billingAccount: { $exists: false } }),
            ...admissionFence,
        }, { $set: { billingAccount: account, updatedAt: new Date(),
            ...(user.transcriptionUsed !== originalTranscriptionUsed ? { transcriptionUsed: user.transcriptionUsed }
                : account.currentPeriodId && account.periods[account.currentPeriodId]
                    && (account.currentPeriodId !== originalPeriodId || account.periods[account.currentPeriodId].consumedSeconds !== originalPeriodConsumed)
                    ? { transcriptionUsed: account.periods[account.currentPeriodId].consumedSeconds } : {}),
        } });
        if (updated.matchedCount) return result;
    }
    throw new Error('Billing account is busy. Retry this operation.');
}
/** Retry one admission after safely retiring an unpaid voluntary upgrade.
 * The failed callback committed nothing; no Stripe call runs inside its CAS. */
export async function mutateUsageBillingAccount<T>(subject: string, change: (account: BillingAccount, user: LedgerUser, db: Db) => T | Promise<T>, database?: Db,
    recover?: (error: PendingPlanCreditBlocksUsageError) => Promise<void>): Promise<T> {
    try { return await mutateBillingAccount(subject, change, database); }
    catch (error) {
        if (!(error instanceof PendingPlanCreditBlocksUsageError)) throw error;
        if (recover) await recover(error);
        else {
            const [{ cancelUnpaidUpgradeForSourceUsage }, { getStripe }] = await Promise.all([import('./plan-change'), import('@/lib/stripe')]);
            await cancelUnpaidUpgradeForSourceUsage(subject, error, { db: database || await getMongoDb(), stripe: getStripe() });
        }
        return mutateBillingAccount(subject, change, database);
    }
}
export async function creditPrepaidFunds(subject: string, input: { id: string; amountMicros: number; source: string; reference: string; processorFeeMicros?: number }, db?: Db) {
    money(input.amountMicros); money(input.processorFeeMicros || 0);
    return mutateBillingAccount(subject, account => {
        const key = ledgerKey(input.id), previous = account.fundingLots[key];
        if (previous) {
            if (previous.amountMicros !== input.amountMicros || previous.reference !== input.reference) throw new Error('Funding receipt conflict.');
            const verifiedFee = Math.max(previous.processorFeeMicros || 0, input.processorFeeMicros || 0);
            const recognizedFee = previous.kind === 'prepaid' ? (previous.amountMicros ? Math.floor(verifiedFee * (previous.spentMicros || 0) / previous.amountMicros) : 0) : verifiedFee;
            const delta = recognizedFee - (previous.processorFeeRecognizedMicros || 0);
            previous.processorFeeMicros = verifiedFee; previous.processorFeeRecognizedMicros = recognizedFee; previous.costMicros += delta; account.recognizedCostMicros += delta;
            return previous;
        }
        const lot: FundingLot = { ...input, kind: 'prepaid', creditedMicros: 0, costMicros: 0, reservedCostMicros: 0, createdAt: new Date() };
        account.fundingLots[key] = lot; account.prepaidFundedMicros += input.amountMicros;
        return lot;
    }, db);
}
export async function creditBaseFunds(subject: string, input: { id: string; amountMicros: number; reference: string; kind: 'base' | 'lifetime'; source?: string; processorFeeMicros?: number }, db?: Db) {
    money(input.amountMicros); money(input.processorFeeMicros || 0);
    return mutateBillingAccount(subject, account => {
        const key = ledgerKey(input.id), previous = account.fundingLots[key];
        if (previous) {
            if (previous.amountMicros !== input.amountMicros || previous.reference !== input.reference) throw new Error('Funding receipt conflict.');
            const verifiedFee = Math.max(previous.processorFeeMicros || 0, input.processorFeeMicros || 0);
            const recognizedFee = previous.kind === 'prepaid' ? (previous.amountMicros ? Math.floor(verifiedFee * (previous.spentMicros || 0) / previous.amountMicros) : 0) : verifiedFee;
            const delta = recognizedFee - (previous.processorFeeRecognizedMicros || 0);
            previous.processorFeeMicros = verifiedFee; previous.processorFeeRecognizedMicros = recognizedFee; previous.costMicros += delta; account.recognizedCostMicros += delta;
            return previous;
        }
        // Base payment receipts prove entitlement; they no longer fund per-job
        // provider expenses or reserve a hidden share of subscription principal.
        const lot: FundingLot = { ...input, source: input.source || 'stripe', creditedMicros: 0, costMicros: input.processorFeeMicros || 0,
            processorFeeRecognizedMicros: input.processorFeeMicros || 0, reservedCostMicros: 0, createdAt: new Date() };
        account.fundingLots[key] = lot; account.recognizedRevenueMicros += input.amountMicros; account.recognizedCostMicros += input.processorFeeMicros || 0;
        return lot;
    }, db);
}
/** Transfer an existing paid funding cohort into a new entitlement without inventing cash revenue. */
export async function reserveEntitlementOperatingCosts(subject: string, entitlementId: string, kind: 'base' | 'lifetime', db?: Db) {
    await archiveManagedCostPolicy(getManagedCostPolicy(), db);
    return mutateBillingAccount(subject, account => {
        const key = ledgerKey(entitlementId); account.entitlementOperatingReservations ||= {};
        if (account.entitlementOperatingReservations[key]) return account.entitlementOperatingReservations[key];
        const policy = getManagedCostPolicy(), targetMicros = policy.recoveryReserveMicros + (kind === 'lifetime' ? policy.lifetimeHostingReserveMicros : 0);
        const protectedTotal = Object.values(account.fundingLots).reduce((sum, lot) => sum + (lot.protectedOperatingCostMicros || 0), 0);
        const additionalMicros = Math.max(0, targetMicros - protectedTotal), allocations: Record<string, number> = {};
        if (additionalMicros > retainedFundingCapacity(account)) throw new OperatingFundingUnavailableError('The retained funding cannot preserve the entitlement operating reserve.');
        let remaining = additionalMicros;
        for (const [lotKey, lot] of Object.entries(account.fundingLots)) {
            if (lot.kind === 'prepaid') continue;
            const amount = Math.min(remaining, retainedLotCapacity(lot));
            lot.protectedOperatingCostMicros = (lot.protectedOperatingCostMicros || 0) + amount; lot.reservedCostMicros += amount; allocations[lotKey] = amount; remaining -= amount;
            if (!remaining) break;
        }
        if (remaining) throw new OperatingFundingUnavailableError('No original cash cohort can fund the entitlement operating reserve.');
        account.reservedCostMicros += additionalMicros;
        const result = { id: entitlementId, kind, targetMicros, additionalMicros, allocations, createdAt: new Date() };
        account.entitlementOperatingReservations[key] = result; return result;
    }, db);
}
/** Stripe grant expiry must be confirmed before revoking local spendable principal. */
export async function revokePrepaidFunds(subject: string, lotId: string, receiptId: string, db?: Db) {
    return mutateBillingAccount(subject, account => {
        const lot = account.fundingLots[ledgerKey(lotId)];
        if (!lot || lot.kind !== 'prepaid') throw new Error('Prepaid funding receipt was not found.');
        if (lot.reversalReceipts?.includes(receiptId)) return { revokedMicros: lot.revokedMicros || 0, spentMicros: lot.spentMicros || 0 };
        const delta = Math.max(0, lot.amountMicros - lot.creditedMicros - (lot.spentMicros || 0) - (lot.revokedMicros || 0));
        lot.revokedMicros = (lot.revokedMicros || 0) + delta; (lot.reversalReceipts ||= []).push(receiptId);
        account.prepaidFundedMicros -= delta;
        account.costReview = { reason: 'prepaid_payment_reversed', evidenceId: receiptId, at: new Date() };
        return { revokedMicros: delta, spentMicros: lot.spentMicros || 0 };
    }, db);
}
/** Called only after the funded recovery/export window and hosting obligation have actually ended. */
export async function releaseProtectedOperatingCosts(subject: string, input: { id: string; lotIds?: string[] }, db?: Db) {
    return mutateBillingAccount(subject, account => {
        let releasedMicros = 0;
        for (const lot of Object.values(account.fundingLots)) {
            if (input.lotIds && !input.lotIds.includes(lot.id)) continue;
            const protectedCost = lot.protectedOperatingCostMicros || 0;
            lot.reservedCostMicros -= protectedCost; account.reservedCostMicros -= protectedCost; releasedMicros += protectedCost; lot.protectedOperatingCostMicros = 0;
        }
        return { id: input.id, releasedMicros };
    }, db);
}
export interface ReserveCostInput { id: string; costPolicyVersion?: string; costPolicyFingerprint?: string; maximumCostMicros: number; retailMicros: number; kind: string; expiresAt: Date; parentId?: string; consumedSeconds?: number; periodId?: string; usageTier?: UsagePricingTier; tariff?: UsageTariffSnapshot; paymentFeeSchedule?: PaymentFeeSchedule; processingBudget?: ProcessingBudgetSnapshot }
/** New holds reserve only the customer's published retail usage. Legacy expense
 * reservations remain readable and recoverable through reserveCost below. */
export interface ReserveRetailUsageInput {
    id: string; retailMicros: number; kind: string; expiresAt: Date;
    acceptedAt?: Date;
    consumedSeconds?: number; includedSeconds?: number; meterQuantity?: number; periodId?: string; usageTier?: UsagePricingTier; tariff?: UsageTariffSnapshot;
    executionPolicy?: ExecutionPolicySnapshot;
}
export function reserveRetailUsage(account: BillingAccount, user: LedgerUser, input: ReserveRetailUsageInput): RetailUsageReservation {
    money(input.retailMicros);
    if (input.includedSeconds !== undefined) money(input.includedSeconds);
    if (input.meterQuantity !== undefined) money(input.meterQuantity);
    if (input.includedSeconds !== undefined && input.consumedSeconds !== undefined && input.includedSeconds > input.consumedSeconds) throw new Error('Included usage cannot exceed accepted audio quantity.');
    const key = ledgerKey(input.id), previous = account.reservations[key];
    if (previous) {
        if (previous.accountingMode !== 'retail_only') throw new Error('The historical expense reservation requires its original settlement adapter.');
        if (previous.retailMicros !== input.retailMicros || previous.kind !== input.kind
            || previous.consumedSeconds !== input.consumedSeconds || previous.periodId !== input.periodId
            || previous.includedSeconds !== input.includedSeconds || previous.meterQuantity !== input.meterQuantity
            || input.usageTier && previous.usageTier !== input.usageTier
            || input.tariff && previous.tariff?.id !== input.tariff.id) throw new Error('Usage reservation conflict.');
        return previous;
    }
    const sourcePlanUsable = sourcePlanUsableWhileAwaitingPayment(user) && hasVerifiedMetering(user)
        && !user.billingRecovery && !Object.keys(user.stripePaymentIssues || {}).length;
    if ((user.billingOperation && !sourcePlanUsable && input.kind !== 'storage-period') || user.billingGrantTransfer
        || user.disabled || user.softDelete?.isDeleted || hasBlockingBillingReview(user.billingReview) || hasBlockingFinancialReview(account)) {
        throw new Error('New usage is paused while billing is reviewed.');
    }
    if (user.billingUsagePriceRollout?.effectiveAt && user.billingUsagePriceRollout.effectiveAt <= new Date()
        && !['applied', 'canceled'].includes(user.billingUsagePriceRollout.state)) {
        throw new BillingSyncPendingError('Usage pricing is being synchronized for the new monthly window. Retry shortly.');
    }
    if (user.billingSchedule?.effectiveAt && user.billingSchedule.effectiveAt <= new Date() && user.billingSchedule.state !== 'ready') {
        throw new BillingSyncPendingError('Your scheduled plan and usage prices are being synchronized. Retry shortly.');
    }
    if (!paidBasePeriodCovers(user, input.acceptedAt || new Date())) {
        throw new BillingSyncPendingError('Your subscription renewal payment is being confirmed. Retry shortly.');
    }
    // A cent-sized temporary hold covers cumulative Stripe line rounding; the
    // actual debit still accumulates fractions per period and price.
    const heldRetailMicros = Math.ceil(input.retailMicros / 10_000) * 10_000;
    money(heldRetailMicros);
    if (getPrepaidState({ billingAccount: account }).availableMicros < heldRetailMicros) {
        throw new PrepaidFundingRequiredError('Add prepaid usage credit before starting this operation.');
    }
    const reservation: RetailUsageReservation = { ...input, accountingMode: 'retail_only', maximumCostMicros: 0,
        usageTier: input.usageTier || usagePricingTier(user), heldRetailMicros, createdAt: new Date(), allocations: {}, state: 'reserved' };
    account.reservations[key] = reservation; account.prepaidReservedMicros += heldRetailMicros;
    return reservation;
}
export async function reservePrepaidUsage(subject: string, input: ReserveRetailUsageInput, db?: Db): Promise<CostReservation> {
    return mutateUsageBillingAccount(subject, async (account, user, database) => {
        const archived = await database.collection<{ _id: string; data: CostReservation }>('billing_financial_archive')
            .findOne({ _id: ledgerKey(`${subject}:reservation:${input.id}`) });
        if (archived) return archived.data;
        return reserveRetailUsage(account, user, input);
    }, db);
}
export function reserveCost(account: BillingAccount, user: LedgerUser, input: ReserveCostInput): CostReservation {
    money(input.maximumCostMicros); money(input.retailMicros);
        const key = ledgerKey(input.id), old = account.reservations[key];
        if (old) {
            if (old.accountingMode === 'retail_only') throw new Error('A retail-only reservation cannot reserve provider expenses.');
            if (old.maximumCostMicros !== input.maximumCostMicros || old.retailMicros !== input.retailMicros
                || input.usageTier && (old.usageTier || 'recurring') !== input.usageTier
                || input.tariff && old.tariff?.id !== input.tariff.id) throw new Error('Cost reservation conflict.');
            return old;
        }
        const continuation = input.parentId && Boolean(account.receipts[ledgerKey(input.parentId)]);
        const sourcePlanUsable = sourcePlanUsableWhileAwaitingPayment(user) && hasVerifiedMetering(user)
            && !user.billingRecovery && !Object.keys(user.stripePaymentIssues || {}).length;
        if ((user.billingOperation && !sourcePlanUsable && !continuation && input.kind !== 'storage-period') || user.billingGrantTransfer || user.disabled || user.softDelete?.isDeleted || user.billingReview || account.costReview) throw new Error('New spending is paused while billing is reviewed.');
        if (!continuation && user.billingUsagePriceRollout?.effectiveAt && user.billingUsagePriceRollout.effectiveAt <= new Date()
            && !['applied', 'canceled'].includes(user.billingUsagePriceRollout.state)) throw new Error('Usage pricing is being synchronized for the new monthly window. Retry shortly.');
        const heldRetailMicros = Math.ceil(input.retailMicros / 10_000) * 10_000;
        const feeLots = Object.values(account.fundingLots).filter(lot => lot.kind === 'prepaid' && lot.amountMicros > (lot.spentMicros || 0) + lot.creditedMicros + (lot.revokedMicros || 0));
        // Deposit fees have already been incurred: their whole remaining amount
        // is committed by operatingFundingCapacity, then amortized at settlement.
        // Charging that allocation here again would reserve the same fee twice.
        const processorFeeBudgetMicros = 0;
        const parentReceipt = input.parentId ? account.receipts[ledgerKey(input.parentId)] : undefined;
        const tier = input.usageTier || (parentReceipt ? parentReceipt.usageTier || 'recurring' : undefined) || usagePricingTier(user);
        const feeSchedule = (parentReceipt?.paymentFeeSchedule || input.paymentFeeSchedule) ?? paymentFeeSchedule(getManagedCostPolicy());
        if (tier === 'lifetime') {
            if (!continuation && (Date.parse(feeSchedule.expiresAt) <= Date.now() || feeSchedule.costPolicyFingerprint !== managedCostPolicyFingerprint(getManagedCostPolicy()))) throw new Error('Review the current Lifetime usage costs before starting new work.');
            const numerator = BigInt(feeSchedule.paymentFeeBasisPoints) * BigInt(feeSchedule.minimumTopupMicros) + BigInt(feeSchedule.paymentFixedMicros) * BigInt(10_000);
            if (feeLots.some(lot => lot.source === 'stripe' && lot.processorFeeMicros === undefined
                || BigInt(lot.processorFeeMicros || 0) * BigInt(10_000) * BigInt(feeSchedule.minimumTopupMicros) > BigInt(lot.amountMicros) * numerator)) {
                throw new Error('Verified Lifetime payment cost evidence is missing or exceeds the reviewed fee schedule. Review payment costs before starting work.');
            }
        }
        if (getPrepaidState({ billingAccount: account }).availableMicros < heldRetailMicros) throw new PrepaidFundingRequiredError('Add prepaid usage credit before starting this operation.');
        const cohort = getUsageFunding(account)[tier];
        const totalCostCap = input.maximumCostMicros + processorFeeBudgetMicros;
        // Failed work earns no usage revenue. The original paid principal or
        // previously earned revenue must cover every accepted call in advance.
        const usageBudget = Math.min(totalCostCap, earnedUsageFundingCapacity(account));
        const requiredRetainedMicros = totalCostCap - usageBudget;
        if (requiredRetainedMicros > retainedFundingCapacity(account) || totalCostCap > operatingFundingCapacity(account)) {
            const operationId = sourcePlanUsable ? user.billingOperation?.id : undefined;
            const afterCancellation = operationId ? accountWithoutPendingPlanCredit(account, operationId) : null;
            if (operationId && afterCancellation && requiredRetainedMicros <= retainedFundingCapacity(afterCancellation)
                && totalCostCap <= operatingFundingCapacity(afterCancellation)) {
                throw new PendingPlanCreditBlocksUsageError(operationId, requiredRetainedMicros, structuredClone(input));
            }
            throw new OperatingFundingUnavailableError('Operating funding is temporarily unavailable. No provider request was started.');
        }
        let remaining = totalCostCap - usageBudget;
        const allocations: Record<string, number> = {};
        for (const [lotKey, lot] of Object.entries(account.fundingLots)) {
            if (lot.kind === 'prepaid') continue;
            const allocated = Math.min(remaining, retainedLotCapacity(lot));
            lot.reservedCostMicros += allocated; allocations[lotKey] = allocated; remaining -= allocated;
            if (!remaining) break;
        }
        if (remaining) throw new OperatingFundingUnavailableError('No retained paid cohort can cover the possible failed-attempt cost.');
        cohort.reservedCostMicros += usageBudget;
        const reservation: CostReservation = { ...input, paymentFeeSchedule: feeSchedule, usageTier: tier, fundingBasis: 'earned_revenue', processorFeeBudgetMicros, heldRetailMicros, usageCostBudgetMicros: usageBudget, createdAt: new Date(), allocations, state: 'reserved' };
        account.reservations[key] = reservation; account.prepaidReservedMicros += heldRetailMicros; account.reservedCostMicros += input.maximumCostMicros + processorFeeBudgetMicros;
        return reservation;
}
function consumePrepaid(account: BillingAccount, amount: number) {
    let remaining = amount;
    for (const lot of Object.values(account.fundingLots)) {
        if (lot.kind !== 'prepaid') continue;
        const used = Math.min(remaining, Math.max(0, lot.amountMicros - lot.creditedMicros - (lot.spentMicros || 0) - (lot.revokedMicros || 0)));
        lot.spentMicros = (lot.spentMicros || 0) + used;
        const allocatedFee = lot.amountMicros ? Math.floor((lot.processorFeeMicros || 0) * lot.spentMicros / lot.amountMicros) : 0;
        const feeDelta = allocatedFee - (lot.processorFeeRecognizedMicros || 0);
        lot.processorFeeRecognizedMicros = allocatedFee; lot.costMicros += feeDelta; account.recognizedCostMicros += feeDelta;
        remaining -= used; if (!remaining) break;
    }
    if (remaining) throw new Error('Prepaid funding provenance does not cover this settlement.');
}
export function adjustPrepaidRounding(account: BillingAccount, delta: number, tier: UsagePricingTier = 'recurring') {
    if (!Number.isSafeInteger(delta)) throw new Error('Invalid monetary rounding adjustment.');
    const cohort = getUsageFunding(account)[tier], beforeFee = account.recognizedCostMicros;
    if (delta >= 0) consumePrepaid(account, delta);
    else {
        let remainder = -delta;
        for (const lot of Object.values(account.fundingLots).reverse()) {
            if (lot.kind !== 'prepaid') continue;
            const restore = Math.min(remainder, lot.spentMicros || 0); lot.spentMicros = (lot.spentMicros || 0) - restore; remainder -= restore;
            const fee = lot.amountMicros ? Math.floor((lot.processorFeeMicros || 0) * lot.spentMicros / lot.amountMicros) : 0;
            const feeDelta = fee - (lot.processorFeeRecognizedMicros || 0); lot.processorFeeRecognizedMicros = fee; lot.costMicros += feeDelta; account.recognizedCostMicros += feeDelta;
            if (!remainder) break;
        }
        if (remainder) throw new Error('Rounding adjustment has no matching prepaid source.');
    }
    account.prepaidSpentMicros += delta; account.recognizedRevenueMicros += delta;
    cohort.revenueMicros += delta;
    // Rounding has a real processor-fee allocation; retain it in the same
    // usage cohort instead of transferring it to a base-plan customer.
    cohort.costMicros += account.recognizedCostMicros - beforeFee;
    if (cohort.revenueMicros < 0) throw new Error('Invoice rounding has no matching earned usage cohort.');
}
export interface CostSettlementInput { actualCostMicros: number; chargedMicros: number; outcome?: 'completed' | 'unknown'; costBasis?: CostReservation['costBasis'] }

export function settleReservation(account: BillingAccount, id: string, input: CostSettlementInput) {
    money(input.actualCostMicros); money(input.chargedMicros);
    const row = account.reservations[ledgerKey(id)];
    if (!row) throw new Error('No cost reservation exists for this operation.');
    if (row.accountingMode === 'retail_only') {
        if (input.actualCostMicros !== 0) throw new Error('Retail usage cannot settle provider expenses.');
        if (row.state === 'settled') {
            if (row.chargedMicros !== input.chargedMicros) throw new Error('Settlement conflict.');
            if (input.outcome === 'completed') row.outcome = 'completed';
            return row;
        }
        if (row.state !== 'reserved' || input.chargedMicros > row.retailMicros) throw new Error('Settlement exceeds its immutable reservation.');
        account.prepaidReservedMicros -= row.heldRetailMicros ?? row.retailMicros;
        const cohort = getUsageFunding(account)[row.usageTier || 'recurring'];
        const costBeforeFee = account.recognizedCostMicros;
        consumePrepaid(account, input.chargedMicros);
        account.prepaidSpentMicros += input.chargedMicros; account.recognizedRevenueMicros += input.chargedMicros;
        cohort.revenueMicros += input.chargedMicros;
        cohort.costMicros += account.recognizedCostMicros - costBeforeFee;
        row.state = 'settled'; row.actualCostMicros = 0; row.chargedMicros = input.chargedMicros;
        if (input.outcome) row.outcome = input.outcome;
        return row;
    }
    if (row.state === 'settled') {
        if (row.costEvidenceId && input.actualCostMicros === row.maximumCostMicros && input.chargedMicros === row.chargedMicros) return row;
        if (row.actualCostMicros !== input.actualCostMicros || row.chargedMicros !== input.chargedMicros) throw new Error('Settlement conflict.');
        // Saving a previously unknown response can prove completion without a
        // second charge or pretending its conservative cost was measured.
        if (input.outcome === 'completed' && row.outcome !== 'completed') row.outcome = 'completed';
        return row;
    }
    if (row.state !== 'reserved' || input.actualCostMicros > row.maximumCostMicros || input.chargedMicros > row.retailMicros) throw new Error('Settlement exceeds its immutable reservation.');
    account.prepaidReservedMicros -= row.heldRetailMicros ?? row.retailMicros; account.reservedCostMicros -= row.maximumCostMicros + (row.processorFeeBudgetMicros || 0);
    const tier = row.usageTier || 'recurring', cohort = getUsageFunding(account)[tier];
    cohort.reservedCostMicros = Math.max(0, cohort.reservedCostMicros - (row.usageCostBudgetMicros || 0));
    const costBeforeFee = account.recognizedCostMicros;
    consumePrepaid(account, input.chargedMicros);
    const incurredFee = account.recognizedCostMicros - costBeforeFee;
    account.prepaidSpentMicros += input.chargedMicros; account.recognizedRevenueMicros += input.chargedMicros; account.recognizedCostMicros += input.actualCostMicros;
    const totalIncurred = input.actualCostMicros + incurredFee;
    cohort.revenueMicros += input.chargedMicros;
    row.usageCostBudgetMicros = Math.min(totalIncurred, earnedUsageFundingCapacity(account));
    cohort.costMicros += row.usageCostBudgetMicros;
    let cost = totalIncurred - row.usageCostBudgetMicros;
    row.costAllocations = {};
    for (const [key, reserved] of Object.entries(row.allocations)) {
        const lot = account.fundingLots[key]; if (!lot) throw new Error('Funding allocation is missing.');
        lot.reservedCostMicros -= reserved; const used = Math.min(cost, reserved); lot.costMicros += used; row.costAllocations[key] = used; cost -= used;
    }
    // Repair a historical under-reservation rather than silently dropping cost.
    for (const [key, lot] of Object.entries(account.fundingLots)) {
        if (!cost) break;
        if (lot.kind === 'prepaid') continue;
        const used = Math.min(cost, retainedLotCapacity(lot), retainedFundingCapacity(account));
        lot.costMicros += used; row.costAllocations[key] = (row.costAllocations[key] || 0) + used; cost -= used;
    }
    if (cost) {
        row.unfundedCostMicros = cost;
        if (!hasBlockingFinancialReview(account)) account.costReview = { reason: 'incurred_cost_exceeds_retained_funding', evidenceId: id, at: new Date() };
    }
    row.processorFeeCostMicros = incurredFee;
    row.state = 'settled'; row.costBasis = 'committed_cap'; Object.assign(row, input);
    const parent = row.parentId && account.receipts[ledgerKey(row.parentId)];
    if (parent) parent.committedCostMicros = (parent.committedCostMicros || 0) + input.actualCostMicros + incurredFee;
    return row;
}
export async function settlePrepaidReservation(subject: string, id: string, input: CostSettlementInput, db?: Db) {
    return mutateBillingAccount(subject, async (account, _user, database) => {
        if (!account.reservations[ledgerKey(id)]) {
            const archived = await database.collection<{ _id: string; data: CostReservation }>('billing_financial_archive').findOne({ _id: ledgerKey(`${subject}:reservation:${id}`) });
            if (archived?.data.state === 'settled' && archived.data.chargedMicros === input.chargedMicros
                && (archived.data.actualCostMicros === input.actualCostMicros || (archived.data.costEvidenceId && input.actualCostMicros === archived.data.maximumCostMicros))) return archived.data;
        }
        const parentId = account.reservations[ledgerKey(id)]?.parentId;
        if (parentId && !account.receipts[ledgerKey(parentId)]) {
            const parent = await database.collection<UsageSettlement & { _id: string }>('billing_usage_receipts').findOne({ _id: ledgerKey(parentId) });
            if (parent) account.receipts[ledgerKey(parentId)] = parent;
        }
        return settleReservation(account, id, input);
    }, db);
}
export async function releasePrepaidReservation(subject: string, id: string, db?: Db) {
    return mutateBillingAccount(subject, account => releaseReservation(account, id), db);
}
export function releaseReservation(account: BillingAccount, id: string) {
        const row = account.reservations[ledgerKey(id)]; if (!row || row.state !== 'reserved') return;
        account.prepaidReservedMicros -= row.heldRetailMicros ?? row.retailMicros; account.reservedCostMicros -= row.maximumCostMicros + (row.processorFeeBudgetMicros || 0);
        for (const [key, amount] of Object.entries(row.allocations)) account.fundingLots[key].reservedCostMicros -= amount;
        const cohort = getUsageFunding(account)[row.usageTier || 'recurring'];
        cohort.reservedCostMicros = Math.max(0, cohort.reservedCostMicros - (row.usageCostBudgetMicros || 0));
        row.state = 'released';
}
function nextMonth(start: Date, anchorDay = start.getUTCDate()) { const date = new Date(start); const day = anchorDay; date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + 1); const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(); date.setUTCDate(Math.min(day, last)); return date; }
/** An active subscription is not proof that its draft renewal was paid. This
 * checks only server-verified paid service, never provider expense capacity. */
export function paidBasePeriodCovers(user: User, at: Date): boolean {
    if (effectiveBillingEntitlementSource(user) !== 'subscription') return true;
    const proof = user.billingPaidBasePeriod;
    return Boolean(proof && proof.customerId === user.stripeCustomerId
        && proof.customerGeneration === (user.stripeCustomerGeneration || 0)
        && proof.subscriptionId === user.stripeSubscriptionId && proof.basePriceId === user.stripePriceId
        && proof.invoiceId && proof.start instanceof Date && proof.end instanceof Date
        && Number.isFinite(proof.start.getTime()) && Number.isFinite(proof.end.getTime())
        && proof.start <= at && proof.end > at && proof.end > proof.start);
}
export function ensurePeriod(account: BillingAccount, user: User, at = new Date()): UsagePeriod {
    let period = account.currentPeriodId ? account.periods[account.currentPeriodId] : undefined;
    if (period && at >= period.start && at < period.end) return period;
    for (const old of Object.values(account.periods)) if (at >= old.start && at < old.end) return old;
    let start = period?.end || user.stripeCurrentPeriodStart || at;
    account.usageAnchorDay ||= start.getUTCDate();
    let end = nextMonth(start, account.usageAnchorDay);
    for (let count = 0; at >= end && count < 1200; count++) { start = end; end = nextMonth(start, account.usageAnchorDay); }
    if (at < start || at >= end) throw new Error('No retained billing period covers this receipt. Review before billing.');
    if (!paidBasePeriodCovers(user, at)) throw new BillingSyncPendingError('The renewal payment is being confirmed. Your next included allowance has not opened yet.');
    const id = ledgerKey(`${user.authSubject}:${start.toISOString()}`);
    period = { id, start, end, consumedSeconds: account.currentPeriodId ? 0 : user.transcriptionUsed || 0,
        tariffVersion: BILLING_CATALOG.version, storageMeterPriceId: user.stripeMetering?.storagePriceId, transcriptionMeterPriceId: user.stripeMetering?.transcriptionPriceId,
        storagePeakBytes: user.storageUsed || 0, chargeablePeakBytes: 0, storageCostMicros: 0, storageBilledMilliGiB: 0, storageChargedMicros: 0 };
    account.periods[id] = period; account.currentPeriodId = id; return period;
}
/** All tariffs allocate the same physical peak units; rates never become meter quantities. */
function storagePeakQuote(period: UsagePeriod, user: User, peakBytes: number) {
    money(peakBytes);
    const currentTariff = activeUsageTariff(user, 'storage'), tier = currentTariff.usageTier;
    const segmentKey = ledgerKey(`storage:${currentTariff.priceId}`), segments = period.storageSegments ||= {};
    const existing = segments[segmentKey], tariff = existing?.tariff || currentTariff;
    if (!sameUsageTariffRate(tariff, currentTariff)) throw new Error('An immutable storage rate changed inside its usage window.');
    const chargeablePeakBytes = Math.max(period.chargeablePeakBytes || 0, Math.max(0, peakBytes - user.storageAllocation));
    const additionalBytes = chargeablePeakBytes - (period.chargeablePeakBytes || 0);
    const additionalQuantity = storageMilliGiB(chargeablePeakBytes) - storageMilliGiB(period.chargeablePeakBytes || 0);
    const quantity = (existing?.meterValue || 0) + additionalQuantity;
    const quote = quoteUsageQuantity(tariff, quantity), deltaQuote = quoteUsageQuantity(tariff, additionalQuantity);
    const segmentBytes = (existing?.chargeablePeakBytes || 0) + additionalBytes;
    const segment: StoragePricingSegment = { tier, tariff, meterPriceId: tariff.priceId, chargeablePeakBytes: segmentBytes, meterValue: quantity,
        chargedMicros: quote.floorMicros };
    const physicalPeak = Math.max(period.storagePeakBytes, peakBytes);
    return { tier, tariff, segmentKey, segment, chargeablePeakBytes, physicalPeak, additionalQuantity, retailMicros: deltaQuote.ceilingMicros };
}
/** The quantity, exact amount, monetary debit and outbox are one document CAS. */
export function putStoragePeak(account: BillingAccount, user: User, peakBytes: number, at = new Date()): UsagePeriod {
    const period = ensurePeriod(account, user, at), quote = storagePeakQuote(period, user, peakBytes);
    const bucket = usageAmountBucket(period, quote.tariff);
    let debitMicros = 0;
    if (quote.additionalQuantity) {
        const reservationId = `storage-period:${period.id}:${quote.segmentKey}:${quote.segment.meterValue}`;
        reserveRetailUsage(account, user, { id: reservationId, usageTier: quote.tier, tariff: quote.tariff,
            retailMicros: quote.retailMicros, kind: 'storage-period', acceptedAt: at, expiresAt: period.end });
        debitMicros = accumulateUsageCharge(bucket, quote.segment.meterValue).debitMicros;
        settleReservation(account, reservationId, { actualCostMicros: 0, chargedMicros: debitMicros });
    }
    period.storagePeakBytes = quote.physicalPeak; period.chargeablePeakBytes = quote.chargeablePeakBytes;
    period.storageBilledMilliGiB = storageMilliGiB(quote.chargeablePeakBytes);
    period.storageChargedMicros += debitMicros;
    period.storageSegments![quote.segmentKey] = quote.segment;
    updateRoundingReserve(account, period, bucket);
    if (bucket.quantity && user.stripeCustomerId && user.stripeSubscriptionId) {
        const id = ledgerKey(`storage-quantity:${user.authSubject}:${period.id}:${quote.tariff.priceId}`);
        account.outbox[id] = { id, subject: user.authSubject, customerId: user.stripeCustomerId, subscriptionId: user.stripeSubscriptionId,
            type: 'storage', usageTier: quote.tier, eventName: bucket.tariff.eventName, tariff: bucket.tariff,
            tariffVersion: bucket.tariff.catalogVersion, meterPriceId: bucket.tariff.priceId, value: bucket.quantity,
            timestamp: Math.floor(Math.min(at.getTime(), period.end.getTime() - 1000) / 1000),
            periodId: period.id, periodStart: period.start, periodEnd: period.end, revision: account.revision + 1 };
    }
    return period;
}
export async function ensureBillingPeriod(subject: string, db?: Db, stripe?: Stripe) {
    const database = db || await getMongoDb();
    let user = await database.collection<User>(Collections.USERS).findOne({ authSubject: subject });
    if (!user) throw new Error('Account unavailable.');
    const { shouldSyncScheduledBillingBoundary, syncScheduledBillingBoundary } = await import('./subscription-schedule');
    // Stripe verification and lifecycle leasing happen before the ledger CAS,
    // never inside a callback that may be retried.
    if (shouldSyncScheduledBillingBoundary(user)) user = await syncScheduledBillingBoundary(subject, { db: database, stripe });
    if (!paidBasePeriodCovers(user, new Date())) {
        const { refreshPaidBasePeriod } = await import('./paid-base-service');
        await refreshPaidBasePeriod(subject, { db: database, stripe });
    }
    return mutateBillingAccount(subject, (account, latest) => putStoragePeak(account, latest, latest.storageUsed || 0), database);
}
/** Provider admission can refresh authoritative service proof without creating
 * a billing window or touching the customer's allowance or prepaid balance. */
export async function ensurePaidBaseForNewWork(user: User, db?: Db, stripe?: Stripe): Promise<void> {
    if (paidBasePeriodCovers(user, new Date())) return;
    const { refreshPaidBasePeriod } = await import('./paid-base-service');
    await refreshPaidBasePeriod(user.authSubject, { db: db || await getMongoDb(), stripe });
}
export async function reserveStorageUsage(subject: string, input: { id: string; projectedStoredBytes: number; allowanceBytes?: number }, db?: Db) {
    const database = db || await getMongoDb();
    let user = await database.collection<LedgerUser>(Collections.USERS).findOne({ authSubject: subject });
    if (!user) throw new Error('Account unavailable.');
    if (!paidBasePeriodCovers(user, new Date())) {
        await ensurePaidBaseForNewWork(user, database);
        user = await database.collection<LedgerUser>(Collections.USERS).findOne({ authSubject: subject });
        if (!user) throw new Error('Account unavailable.');
    }
    if (input.allowanceBytes !== undefined) user.storageAllocation = input.allowanceBytes;
    const account = getBillingAccount(user), period = ensurePeriod(account, user), quote = storagePeakQuote(period, user, input.projectedStoredBytes);
    return reservePrepaidUsage(subject, { id: `storage-upload:${input.id}`, retailMicros: quote.retailMicros,
        usageTier: quote.tier, tariff: quote.tariff, kind: 'storage-upload', expiresAt: new Date(Date.now() + 24 * 60 * 60_000) }, database);
}
export const releaseStorageUsage = (subject: string, id: string, db?: Db) => releasePrepaidReservation(subject, `storage-upload:${id}`, db);
/** Non-recurring entitlements consume their existing cumulative quota once;
 * neither login nor a calendar boundary creates a fresh included allowance. */
export function settleIncludedTranscription(account: BillingAccount, user: User, input: {
    id: string; reservationId: string; consumedSeconds: number; acceptedAt: Date;
}): UsageSettlement {
    const key = ledgerKey(input.id), previous = account.receipts[key];
    if (previous) return previous;
    money(input.consumedSeconds);
    const reservation = account.reservations[ledgerKey(input.reservationId)];
    if (!reservation || reservation.accountingMode !== 'retail_only' || reservation.retailMicros !== 0
        || reservation.consumedSeconds !== input.consumedSeconds) throw new Error('The included transcription reservation is unavailable.');
    settleReservation(account, input.reservationId, { actualCostMicros: 0, chargedMicros: 0, outcome: 'completed' });
    user.transcriptionUsed = (user.transcriptionUsed || 0) + input.consumedSeconds;
    money(user.transcriptionUsed);
    return account.receipts[key] = { id: input.id, consumedSeconds: input.consumedSeconds, meterBlocks: 0,
        meterQuantity: 0, chargedMicros: 0, acceptedAt: input.acceptedAt, periodId: `included:${user.authSubject}` };
}
export function settleTranscription(account: BillingAccount, user: User, input: { id: string; consumedSeconds: number; acceptedAt: Date; allowanceSeconds: number; customerId: string; subscriptionId: string; reservationId?: string; actualCostMicros?: number; meterPriceId?: string; tariffVersion?: string; usageTier?: UsagePricingTier; retailMicros?: number; tariff?: UsageTariffSnapshot }): UsageSettlement {
    const key = ledgerKey(input.id), previous = account.receipts[key]; if (previous) return previous;
    const tariff = input.tariff || (input.reservationId ? account.reservations[ledgerKey(input.reservationId)]?.tariff : undefined) || activeUsageTariff(user, 'transcription');
    assertUsageTariff(tariff);
    if (tariff.kind !== 'transcription' || input.meterPriceId && input.meterPriceId !== tariff.priceId || input.usageTier && input.usageTier !== tariff.usageTier) throw new Error('The accepted transcription tariff does not match its receipt.');
    const period = ensurePeriod(account, user, input.acceptedAt);
    const before = Math.max(0, period.consumedSeconds - input.allowanceSeconds);
    const after = Math.max(0, period.consumedSeconds + input.consumedSeconds - input.allowanceSeconds);
    const reservation = input.reservationId ? account.reservations[ledgerKey(input.reservationId)] : undefined;
    // Successful jobs consume their atomically assigned allowance. Completion
    // order never increases a quoted retail charge or steals an earlier hold.
    const frozen = reservation?.accountingMode === 'retail_only' && reservation.meterQuantity !== undefined;
    const quantity = frozen ? reservation.meterQuantity! : minimumBillableQuantity(tariff, Math.ceil((after - before) / 15));
    const includedSeconds = frozen ? reservation.includedSeconds || 0 : Math.max(0, input.consumedSeconds - (after - before));
    const bucket = usageAmountBucket(period, tariff), exact = quoteUsageQuantity(tariff, quantity);
    const chargedMicros = accumulateUsageCharge(bucket, bucket.quantity + quantity).debitMicros;
    if (input.reservationId) settleReservation(account, input.reservationId, { actualCostMicros: input.actualCostMicros || 0, chargedMicros, outcome: 'completed' });
    else if (quantity) throw new Error('Paid transcription has no funding reservation. Review before billing.');
    if (frozen) period.includedConsumedSeconds = (period.includedConsumedSeconds ?? Math.min(period.consumedSeconds, input.allowanceSeconds)) + includedSeconds;
    else if (period.includedConsumedSeconds !== undefined) period.includedConsumedSeconds += includedSeconds;
    period.consumedSeconds += input.consumedSeconds;
    period.transcriptionChargedMicros = (period.transcriptionChargedMicros || 0) + chargedMicros;
    updateRoundingReserve(account, period, bucket);
    const receipt: UsageSettlement = { id: input.id, tariff, paymentFeeSchedule: reservation?.paymentFeeSchedule, usageTier: tariff.usageTier, meterQuantity: quantity,
        consumedSeconds: input.consumedSeconds, includedSeconds, meterBlocks: quantity, chargedMicros, exactChargeAtoms: exact.exactAtoms,
        acceptedAt: input.acceptedAt, periodId: period.id, committedCostMicros: (input.actualCostMicros || 0) + (reservation?.processorFeeCostMicros || 0) };
    account.receipts[key] = receipt;
    if (quantity) account.outbox[key] = { id: key, subject: user.authSubject, customerId: input.customerId, subscriptionId: input.subscriptionId,
        type: 'transcription', tariff, usageTier: tariff.usageTier, eventName: tariff.eventName,
        tariffVersion: tariff.catalogVersion, meterPriceId: tariff.priceId, value: quantity,
        timestamp: Math.floor(input.acceptedAt.getTime() / 1000), periodId: period.id, periodStart: period.start, periodEnd: period.end, revision: account.revision + 1 };
    return receipt;
}

export async function completeStorageUsage(subject: string, input: { id: string; storedBytes: number }, db?: Db) {
    return mutateBillingAccount(subject, (account, user) => { releaseReservation(account, `storage-upload:${input.id}`); return putStoragePeak(account, user, input.storedBytes); }, db);
}
export function isBillingAccountDrained(user: LedgerUser): boolean { const account = getBillingAccount(user); return !Object.keys(account.outbox).length && !Object.values(account.reservations).some(row => row.state === 'reserved'); }

/** Archive before removing hot-document receipts; permanent archive keys preserve replay safety. */
async function compactAccount(account: BillingAccount, subject: string, db: Db) {
    const cutoff = Date.now() - 40 * 86400_000, costCutoff = Date.now() - 3600_000;
    if (Object.keys(account.receipts).length + Object.keys(account.reservations).length >= 1000) {
        type Archive = { _id: string; [key: string]: unknown };
        const quota: AnyBulkWriteOperation<Archive>[] = [], financial: AnyBulkWriteOperation<Archive>[] = [];
        for (const [key, receipt] of Object.entries(account.receipts)) {
            if (quota.length >= 250) break;
            if (receipt.acceptedAt.getTime() >= costCutoff || account.outbox[key]) continue;
            quota.push({ updateOne: { filter: { _id: key }, update: {
                $setOnInsert: { ...Object.fromEntries(Object.entries(receipt).filter(([field]) => field !== 'committedCostMicros')), authSubject: subject, archivedAt: new Date() },
                $max: { committedCostMicros: receipt.committedCostMicros || 0 },
            }, upsert: true } });
            delete account.receipts[key];
        }
        for (const [key, reservation] of Object.entries(account.reservations)) {
            if (financial.length >= 250) break;
            if (reservation.state === 'reserved' || reservation.createdAt.getTime() >= costCutoff) continue;
            const data = { authSubject: subject, kind: 'reservation', data: reservation, archivedAt: new Date() };
            financial.push({ updateOne: { filter: { _id: ledgerKey(`${subject}:reservation:${reservation.id}`) },
                update: reservation.accountingRevision || reservation.costBasis && reservation.costBasis !== 'committed_cap' ? { $set: data } : { $setOnInsert: data }, upsert: true } });
            delete account.reservations[key];
        }
        for (const [key, period] of Object.entries(account.periods)) {
            if (financial.length >= 250) break;
            if (period.end.getTime() >= cutoff || key === account.currentPeriodId || Object.values(account.outbox).some(row => row.periodId === key)) continue;
            if (period.archiveHydrated || Object.values(period.usageAmounts || {}).some(bucket => nonnegativeAtoms(bucket.settledExactAtoms) !== nonnegativeAtoms(bucket.invoicedExactAtoms) || bucket.roundingReservedMicros > 0)
                || Object.values(account.reservations).some(row => row.state === 'reserved' && row.periodId === key)) continue;
            financial.push({ updateOne: { filter: { _id: ledgerKey(`${subject}:period:${key}`) },
                update: { $setOnInsert: { authSubject: subject, kind: 'period', data: period, archivedAt: new Date() } }, upsert: true } });
            delete account.periods[key];
        }
        // Each collection is idempotent before the user CAS. Partial archive success can be retried safely.
        if (quota.length) await db.collection<Archive>('billing_usage_receipts').bulkWrite(quota);
        if (financial.length) await db.collection<Archive>('billing_financial_archive').bulkWrite(financial);
    }
    if (JSON.stringify(account).length > 8 * 1024 * 1024) throw new Error('Financial history requires archival before more spending can be accepted.');
}

function updateRoundingReserve(account: BillingAccount, period: UsagePeriod, bucket: UsageAmountAccumulator) {
    const reserved = usageRoundingReserve(bucket), difference = reserved - bucket.roundingReservedMicros;
    if (difference > getPrepaidState({ billingAccount: account }).availableMicros) throw new Error('Prepaid balance cannot cover final invoice rounding.');
    account.prepaidReservedMicros += difference; bucket.roundingReservedMicros = reserved;
    period[bucket.tariff.kind === 'storage' ? 'storageRoundingMicros' : 'transcriptionRoundingMicros'] = Object.values(period.usageAmounts || {})
        .filter(row => row.tariff.kind === bucket.tariff.kind).reduce((sum, row) => sum + row.roundingReservedMicros, 0);
}
/** Cumulative exact claims preserve fractions across partial invoice lines. */
export async function reconcileUsageInvoiceRounding(account: BillingAccount, input: { type: 'storage' | 'transcription'; meterPriceId: string; usageTier?: UsagePricingTier; periodStart: number; periodEnd: number; exactAtoms: string; principalMinor: number; subject?: string; db?: Db }) {
    const tier = input.usageTier || 'recurring';
    let remaining = nonnegativeAtoms(input.exactAtoms), attributedMicros = 0;
    const key = ledgerKey(`${input.type}:${input.meterPriceId}`);
    // Recover already-archived periods from older compaction rules. Keep their
    // mutable invoice claims hot: the immutable archive is a source snapshot,
    // and must never replace a later committed rounding claim on another retry.
    if (input.db && input.subject) {
        for await (const row of input.db.collection<{ _id: string; data: UsagePeriod }>('billing_financial_archive').find({ authSubject: input.subject, kind: 'period',
            'data.start': { $lt: new Date(input.periodEnd * 1000) }, 'data.end': { $gt: new Date(input.periodStart * 1000) } })) {
            if (!account.periods[row.data.id] && row.data.usageAmounts?.[key]?.tariff.usageTier === tier) account.periods[row.data.id] = { ...structuredClone(row.data), archiveHydrated: true };
        }
    }
    for (const period of Object.values(account.periods).sort((left, right) => left.start.getTime() - right.start.getTime())) {
        if (period.start.getTime() / 1000 >= input.periodEnd || period.end.getTime() / 1000 <= input.periodStart) continue;
        const bucket = period.usageAmounts?.[key];
        if (!bucket || bucket.tariff.usageTier !== tier) continue;
        const available = nonnegativeAtoms(bucket.settledExactAtoms) - nonnegativeAtoms(bucket.invoicedExactAtoms);
        const amount = remaining < available ? remaining : available;
        if (amount <= BigInt(0)) continue;
        attributedMicros += applyUsageInvoiceAmount(bucket, amount.toString(), 0).attributedMicros;
        remaining -= amount;
        updateRoundingReserve(account, period, bucket);
    }
    if (remaining) throw new Error('Invoice rounding has no matching uninvoiced usage source.');
    const principalMicros = money(input.principalMinor * 10_000), deltaMicros = principalMicros - attributedMicros;
    if (deltaMicros > getPrepaidState({ billingAccount: account }).availableMicros) throw new Error('Invoice rounding exceeded the retained prepaid buffer.');
    adjustPrepaidRounding(account, deltaMicros, tier);
    const shortfall = () => Math.max(0, -earnedUsageFundingBalance(account));
    if (shortfall() && input.db && input.subject) {
        // Old reservations may have left the hot document before finalization.
        // Restore only enough provenance to cover the sub-cent rounding loss.
        const archived = input.db.collection<{ _id: string; data: CostReservation }>('billing_financial_archive').find({ authSubject: input.subject, kind: 'reservation',
            'data.usageCostBudgetMicros': { $gt: 0 } }).limit(25);
        for await (const row of archived) if (!account.reservations[ledgerKey(row.data.id)]) account.reservations[ledgerKey(row.data.id)] = row.data;
    }
    for (const row of Object.values(account.reservations)) {
        if (!shortfall()) break;
        if (row.state === 'released' || !(row.usageCostBudgetMicros || 0)) continue;
        const cohort = getUsageFunding(account)[row.usageTier || 'recurring'];
        let move = Math.min(shortfall(), row.usageCostBudgetMicros || 0);
        for (const [lotKey, lot] of Object.entries(account.fundingLots)) {
            if (!move) break;
            if (lot.kind === 'prepaid') continue;
            // This is attribution of an already-incurred expense, not new
            // spending. Its negative earned balance is the amount being moved
            // into principal and must not reduce that principal a second time.
            const amount = Math.min(move, retainedLotCapacity(lot), retainedPrincipalAfterPrepaidFees(account));
            if (!amount) continue;
            if (row.state === 'settled') {
                lot.costMicros += amount; (row.costAllocations ||= {})[lotKey] = (row.costAllocations[lotKey] || 0) + amount; cohort.costMicros -= amount;
            } else {
                lot.reservedCostMicros += amount; row.allocations[lotKey] = (row.allocations[lotKey] || 0) + amount; cohort.reservedCostMicros -= amount;
            }
            row.usageCostBudgetMicros! -= amount; row.accountingRevision = (row.accountingRevision || 0) + 1; move -= amount;
        }
    }
    if (shortfall() && !hasBlockingFinancialReview(account)) account.costReview = { reason: 'invoice_rounding_requires_operating_reserve', evidenceId: `rounding:${tier}`, at: new Date() };
    return { deltaMicros, attributedMicros };
}

import type { Db } from 'mongodb';
import type { User } from '@/lib/db/types';
import { getHistoricalManagedCostPolicy } from './cost-schedule';
import { settleOperatorCost, releaseOperatorCost } from './legacy-operator-costs';
import { assertPublishedUsageMapping } from './catalog-publication';
import { hasVerifiedMetering } from './billing-types';
import { BILLING_CATALOG, assertManagedTranscriptionLimits, weightedBlocks, usagePricingTier, type UsagePricingTier } from './catalog';
import { assertUsageTariff, minimumBillableQuantity, quoteUsageQuantity, type UsageTariffSnapshot } from './usage-tariff';
import { ensurePeriod, ledgerKey, mutateBillingAccount, mutateUsageBillingAccount, ensurePaidBaseForNewWork, reserveRetailUsage, settleTranscription, settleIncludedTranscription, type PaymentFeeSchedule } from './ledger';
import { settlePrepaidReservation, releasePrepaidReservation } from './ledger';
import { getMongoDb } from '@/lib/mongodb';
import { Collections } from '@/lib/mongodb';
import type { TranscriptionResult } from '@/services/transcription/types';
import type { Recording } from '@/lib/db/types';
import { incrementTranscriptionUsed } from '@/lib/db/users/usage';
import { billingEnabled } from '@/lib/config';
import type { TranscriptionBillingContext } from './usage';
import { effectiveBillingEntitlementSource } from './entitlement-source';
import { resolveFundingSource } from './funding-source';
import { buildPreflightExecutionLimits } from '@/lib/transcription/ai-work-plan';
import { closeProcessingBudget, type ProcessingBudgetSnapshot } from './legacy-processing-budget';
import { getExecutionPolicy, prepareExecutionPolicy, closeExecutionPolicy, type ExecutionPolicySnapshot } from './execution-policy';
import { AI_PROMPT_VERSION } from '@/services/ai/prompts';
import { CURRENT_AI_PLANNER_VERSION } from '@/lib/transcription/processing-policy';
import { assertProcessingAvailable } from '@/lib/processing-availability';

export interface TranscriptionReceipt {
    version: 2; id: string; sourceAttemptId: string; provider: string; model: string; multiplier: number;
    consumedSeconds: number; allowanceSeconds: number; includedSeconds?: number; meterQuantity?: number; acceptedAt: Date; billing: TranscriptionBillingContext | null;
    reservationId?: string; operatorReservationId?: string; operatorFundingKind?: 'trial' | 'grant' | 'internal'; maximumCostMicros: number; readyAt?: Date; queuedAt?: Date;
    tariffVersion: string; currency: 'usd'; priceIds?: { storage: string; transcription: string }; planCatalogVersion?: string; costPolicyVersion?: string; costPolicyFingerprint?: string; infrastructureCostMicros?: number; fileSize?: number;
    usageTier?: UsagePricingTier; retailMicros?: number;
    /** @deprecated Historical receipt evidence only; never an admission rule. */
    minimumMarginBps?: number;
    tariff?: UsageTariffSnapshot; paymentFeeSchedule?: PaymentFeeSchedule; aiBudgetMicros?: number; overheadCostMicros?: number;
    /** @deprecated Accepted historical expense evidence only. */
    processingBudget?: ProcessingBudgetSnapshot; unpriced?: boolean;
    accountingMode?: 'retail_only'; executionPolicy?: ExecutionPolicySnapshot;
}
interface ProviderAttempt { _id: string; authSubject: string; recordingId: string; provider: string; receipt: TranscriptionReceipt; externalIds?: string[]; createdAt: Date; providerUsage?: TranscriptionResult['usage']; providerUsageCapturedAt?: Date; costVerificationStatus?: string }
/** Capture before provider submission. An enrichment retry keeps this original receipt, rate and attempt. */
export async function createTranscriptionReceipt(user: User, recordingId: string, attemptId: string, provider: string, model: string | undefined, duration: number, fileSize: number, db?: Db): Promise<TranscriptionReceipt> {
    const definition = assertManagedTranscriptionLimits(provider, model, duration, fileSize);
    const acceptedAt = new Date(), id = `transcription-v2:${user.authSubject}:${recordingId}:${attemptId}`;
    const database = db || await getMongoDb();
    const previous = await database.collection<ProviderAttempt>('billing_provider_attempts').findOne({ _id: ledgerKey(id) });
    if (previous) {
        if (previous.authSubject !== user.authSubject || previous.recordingId !== recordingId || previous.provider !== provider
            || previous.receipt.model !== definition.model || previous.receipt.fileSize !== fileSize
            || previous.receipt.consumedSeconds !== weightedBlocks(duration, definition.multiplier) * 15) throw new Error('Accepted transcription identity changed.');
        return previous.receipt;
    }
    const seconds = weightedBlocks(duration, definition.multiplier) * 15, roundedDuration = Math.ceil(duration / 15) * 15;
    const source = effectiveBillingEntitlementSource(user);
    const fundingSource = resolveFundingSource(user, true);
    const billing: TranscriptionBillingContext | null = hasVerifiedMetering(user) && user.stripeCustomerId && user.stripeSubscriptionId && (source === 'subscription' || source === 'lifetime')
        ? { authSubject: user.authSubject, customerId: user.stripeCustomerId, subscriptionId: user.stripeSubscriptionId, source, acceptedAt } : null;
    const receipt: TranscriptionReceipt = { version: 2, id, sourceAttemptId: attemptId, provider, model: definition.model, multiplier: definition.multiplier,
        consumedSeconds: seconds, allowanceSeconds: user.transcriptionAllocation, acceptedAt, billing, maximumCostMicros: 0,
        tariffVersion: BILLING_CATALOG.version, currency: 'usd', fileSize, usageTier: usagePricingTier(user),
        ...(user.stripeMetering ? { priceIds: { storage: user.stripeMetering.storagePriceId, transcription: user.stripeMetering.transcriptionPriceId } } : {}) };
    if (!fundingSource || fundingSource === 'customer' && !billing) throw new Error('Verified customer billing or an explicit operator-funded entitlement is required before provider work.');
    await ensurePaidBaseForNewWork(user, database);
    await assertProcessingAvailable(database);
    receipt.accountingMode = 'retail_only';
    const recoveredPolicy = await getExecutionPolicy(user.authSubject, id, database);
    const workflow = recoveredPolicy || buildPreflightExecutionLimits({ fundingSource, provider, model: definition.model, durationSeconds: roundedDuration, fileSize });
    receipt.executionPolicy = recoveredPolicy || { version: 1, id, parentReceiptId: id, fundingSource, provider, model: definition.model,
        aiModels: workflow.aiModels, transcriptEnvelope: workflow.transcriptEnvelope, promptVersion: AI_PROMPT_VERSION, maximumAttempts: 2,
        acceptedAt: acceptedAt.toISOString(), audioDurationSeconds: roundedDuration, fileSize, recordingId, plannerVersion: CURRENT_AI_PLANNER_VERSION };
    const expiresAt = new Date(acceptedAt.getTime() + 35 * 86400_000);
    let tariff: UsageTariffSnapshot | undefined;
    if (billing) {
        if (!receipt.priceIds) throw new Error('Verified immutable usage mapping is required before provider work.');
        const purchasedCatalog = await assertPublishedUsageMapping(user, database, receipt.priceIds);
        tariff = user.billingUsageTariffs?.transcription || purchasedCatalog.usageTariffs?.transcription;
        if (!tariff) throw new Error('Publish and synchronize the account usage tariff before provider work.');
        assertUsageTariff(tariff);
        if (tariff.kind !== 'transcription' || tariff.usageTier !== receipt.usageTier || tariff.priceId !== receipt.priceIds.transcription) throw new Error('The accepted usage tariff does not match the account.');
        receipt.tariff = tariff; receipt.tariffVersion = tariff.catalogVersion; receipt.planCatalogVersion = purchasedCatalog._id;
    }
    receipt.reservationId = id;
    await mutateUsageBillingAccount(user.authSubject, (account, latest) => {
        const existing = account.reservations[ledgerKey(id)];
        if (existing) {
            const frozen = existing.executionPolicy;
            if (existing.accountingMode !== 'retail_only' || !frozen || frozen.provider !== provider || frozen.model !== definition.model
                || frozen.audioDurationSeconds !== roundedDuration || frozen.fileSize !== fileSize || frozen.fundingSource !== fundingSource) throw new Error('The interrupted acceptance requires its original receipt.');
            receipt.executionPolicy = frozen; receipt.acceptedAt = new Date(frozen.acceptedAt); receipt.retailMicros = existing.retailMicros;
            receipt.includedSeconds = existing.includedSeconds; receipt.meterQuantity = existing.meterQuantity;
            if (existing.tariff) { receipt.tariff = existing.tariff; receipt.tariffVersion = existing.tariff.catalogVersion;
                receipt.priceIds = { ...receipt.priceIds!, transcription: existing.tariff.priceId }; }
            if (receipt.billing) receipt.billing.acceptedAt = receipt.acceptedAt;
            return;
        }
        if (resolveFundingSource(latest, true) !== fundingSource) throw new Error('The entitlement changed before provider submission. Retry with the current plan.');
        const period = billing ? ensurePeriod(account, latest, acceptedAt) : undefined;
        if (billing && (latest.stripeCustomerId !== billing.customerId || latest.stripeSubscriptionId !== billing.subscriptionId
            || latest.billingUsageTariffs?.transcription.id !== tariff!.id)) throw new Error('Billing changed before provider submission. Retry with the current plan.');
        receipt.allowanceSeconds = latest.transcriptionAllocation;
        if (period) period.includedConsumedSeconds ??= Math.min(period.consumedSeconds, latest.transcriptionAllocation);
        const pending = Object.values(account.reservations).filter(row => row.state === 'reserved' && row.kind === 'transcription'
            && (billing ? row.periodId === period!.id : !row.periodId)).reduce((sum, row) => sum + (row.includedSeconds ?? row.consumedSeconds ?? 0), 0);
        const available = Math.max(0, receipt.allowanceSeconds - (period?.includedConsumedSeconds ?? latest.transcriptionUsed ?? 0) - pending);
        receipt.includedSeconds = fundingSource === 'internal' ? seconds : Math.min(seconds, available);
        const overage = seconds - receipt.includedSeconds;
        if (fundingSource !== 'internal' && source !== 'lifetime' && overage > 0 && (!billing || !latest.billingSettings.allowOverage)) throw new Error('Included transcription quota is exhausted. Enable prepaid overage to continue.');
        receipt.meterQuantity = tariff ? minimumBillableQuantity(tariff, Math.ceil(overage / 15)) : 0;
        receipt.retailMicros = tariff ? quoteUsageQuantity(tariff, receipt.meterQuantity).ceilingMicros : 0;
        reserveRetailUsage(account, latest, { id, tariff, kind: 'transcription', acceptedAt: receipt.acceptedAt, consumedSeconds: seconds, periodId: period?.id,
            retailMicros: receipt.retailMicros, includedSeconds: receipt.includedSeconds, meterQuantity: receipt.meterQuantity, usageTier: receipt.usageTier, executionPolicy: receipt.executionPolicy, expiresAt });
    }, database);
    receipt.executionPolicy = await prepareExecutionPolicy(user.authSubject, receipt.executionPolicy!, database);
    receipt.acceptedAt = new Date(receipt.executionPolicy.acceptedAt);
    if (receipt.billing) receipt.billing.acceptedAt = receipt.acceptedAt;
    await database.collection<ProviderAttempt>('billing_provider_attempts').updateOne({ _id: ledgerKey(id) }, {
        $setOnInsert: { authSubject: user.authSubject, recordingId, provider, receipt, createdAt: new Date() },
    }, { upsert: true });
    return receipt;
}
export async function rememberProviderReference(receipt: TranscriptionReceipt, externalId: string, db?: Db) {
    if (!receipt.billing && !receipt.operatorReservationId && !receipt.executionPolicy) return;
    await (db || await getMongoDb()).collection<ProviderAttempt>('billing_provider_attempts').updateOne({ _id: ledgerKey(receipt.id) }, { $addToSet: { externalIds: externalId } });
}
/** Preserve raw provider token/model evidence without claiming an estimated duration cap is an actual invoice. */
export async function rememberProviderUsage(receipt: TranscriptionReceipt, usage: TranscriptionResult['usage'], db?: Db) {
    if ((!receipt.billing && !receipt.operatorReservationId && !receipt.executionPolicy) || !usage) return;
    await (db || await getMongoDb()).collection<ProviderAttempt>('billing_provider_attempts').updateOne({ _id: ledgerKey(receipt.id) }, {
        $set: { providerUsage: usage, providerUsageCapturedAt: new Date(), costVerificationStatus: receipt.executionPolicy ? 'operational_usage' : 'pending_audited_provider_cost' },
    });
}
/** Signed callbacks can settle accepted work after the owner erased the recording or account. No transcript is fetched or retained. */
export async function settleRemovedRecording(subject: string, recordingId: string, provider: string, externalIds: string[], attemptId: string | undefined, success: boolean, db?: Db): Promise<boolean> {
    const database = db || await getMongoDb();
    const attempt = await database.collection<ProviderAttempt>('billing_provider_attempts').findOne({ authSubject: subject, recordingId, provider,
        ...(attemptId ? { 'receipt.sourceAttemptId': attemptId } : { externalIds: { $in: externalIds } }) });
    if (!attempt?.receipt.billing && !attempt?.receipt.operatorReservationId && !attempt?.receipt.executionPolicy) return false;
    if (success) {
        await settleCanonicalTranscription(subject, attempt.receipt, database);
        // Deleted content has no enrichment work to perform. Closing still
        // refuses any already accepted/unknown child calls before releasing.
        if (attempt.receipt.executionPolicy) await closeExecutionPolicy(subject, attempt.receipt.id, database);
        else if (attempt.receipt.processingBudget) await closeProcessingBudget(subject, attempt.receipt.id, database);
    }
    else await settleFailedTranscription(subject, attempt.receipt, database, 'failed');
    return true;
}
export async function settleCanonicalTranscription(subject: string, receipt: TranscriptionReceipt, db?: Db) {
    if (!billingEnabled()) return;
    if (!receipt.executionPolicy && receipt.operatorFundingKind !== 'internal' && (!receipt.costPolicyVersion || (await getHistoricalManagedCostPolicy(receipt.costPolicyVersion, db)).fingerprint !== receipt.costPolicyFingerprint)) throw new Error('The accepted historical cost schedule needs review before settlement.');
    if (receipt.operatorReservationId) return settleOperatorCost(subject, receipt.operatorReservationId, { actualCostMicros: receipt.maximumCostMicros, outcome: 'completed', costBasis: receipt.unpriced ? 'unpriced' : 'committed_cap' }, db);
    if (receipt.executionPolicy && !receipt.billing) return mutateBillingAccount(subject, (account, user) => settleIncludedTranscription(account, user, { id: receipt.id, reservationId: receipt.reservationId!, consumedSeconds: receipt.consumedSeconds, acceptedAt: receipt.acceptedAt }), db);
    if (!receipt.billing) throw new Error('The managed transcription has no durable cost reservation.');
    if (!receipt.tariff || receipt.currency !== 'usd') throw new Error('The accepted tariff requires historical reconciliation before delivery.');
    assertUsageTariff(receipt.tariff);
    if (receipt.billing.authSubject !== subject) throw new Error('Transcription billing owner mismatch.');
    return mutateBillingAccount(subject, async (account, user, database) => {
        const archived = await database.collection<{ _id: string }>('billing_usage_receipts').findOne({ _id: ledgerKey(receipt.id) });
        if (archived) return;
        return settleTranscription(account, user, { id: receipt.id, consumedSeconds: receipt.consumedSeconds,
            acceptedAt: receipt.acceptedAt, allowanceSeconds: receipt.allowanceSeconds,
            customerId: receipt.billing!.customerId, subscriptionId: receipt.billing!.subscriptionId,
            reservationId: receipt.reservationId, actualCostMicros: receipt.maximumCostMicros,
            meterPriceId: receipt.priceIds?.transcription, tariffVersion: receipt.tariffVersion, usageTier: receipt.usageTier, tariff: receipt.tariff });
    }, db);
}
export async function settleFailedTranscription(subject: string, receipt: TranscriptionReceipt, db?: Db, outcome: 'failed' | 'unknown' = 'unknown') {
    if (receipt.executionPolicy) {
        // A lost response can still become successful audio. Its retail and
        // allowance claims remain until an authoritative outcome is known.
        if (outcome === 'failed') {
            if (receipt.reservationId) await releasePrepaidReservation(subject, receipt.reservationId, db);
            await closeExecutionPolicy(subject, receipt.id, db);
        }
        return;
    }
    if (!receipt.executionPolicy && receipt.operatorFundingKind !== 'internal' && (!receipt.costPolicyVersion || (await getHistoricalManagedCostPolicy(receipt.costPolicyVersion, db)).fingerprint !== receipt.costPolicyFingerprint)) throw new Error('The accepted historical cost schedule needs review before settlement.');
    if (receipt.operatorReservationId) await settleOperatorCost(subject, receipt.operatorReservationId, { actualCostMicros: receipt.maximumCostMicros, outcome: 'unknown' }, db);
    else if (receipt.reservationId) await settlePrepaidReservation(subject, receipt.reservationId, { actualCostMicros: receipt.maximumCostMicros, chargedMicros: 0, outcome: 'unknown' }, db);
    else throw new Error('Failed managed provider work has no retained cost reservation.');
    if (receipt.processingBudget) await closeProcessingBudget(subject, receipt.id, db);
}
export async function releaseTranscriptionReservation(subject: string, receipt: TranscriptionReceipt, db?: Db) {
    if (receipt.operatorReservationId) await releaseOperatorCost(subject, receipt.operatorReservationId, db);
    if (receipt.reservationId) await releasePrepaidReservation(subject, receipt.reservationId, db);
    if (receipt.executionPolicy) await closeExecutionPolicy(subject, receipt.id, db);
    else if (receipt.processingBudget) await closeProcessingBudget(subject, receipt.id, db);
}
/** The recording result is the source outbox; recover a crash between saving successful audio and financial settlement. */
export async function repairTranscriptionReceipts(database?: Db, limit = 50): Promise<number> {
    if (!billingEnabled()) return 0;
    const db = database || await getMongoDb(); let count = 0;
    const now = new Date();
    for await (const recording of db.collection<Recording>(Collections.RECORDINGS).find({
        'transcriptionReceipt.readyAt': { $exists: true }, 'transcriptionReceipt.queuedAt': { $exists: false },
        $or: [{ 'transcriptionSettlementRepair.retryAt': { $exists: false } }, { 'transcriptionSettlementRepair.retryAt': { $lte: now } }],
    }).sort({ 'transcriptionSettlementRepair.checkedAt': 1, _id: 1 }).limit(limit)) {
        const receipt = recording.transcriptionReceipt!;
        const fence = { _id: recording._id, 'transcriptionReceipt.id': receipt.id, 'transcriptionReceipt.queuedAt': { $exists: false } };
        try {
            const retailOnly = receipt.accountingMode === 'retail_only' || Boolean(receipt.executionPolicy);
            const deliveredThisReceipt = recording.transcriptionUsageReportId === receipt.id;
            const deliveredLegacy = !retailOnly && Boolean(recording.transcriptionUsageReportedAt || recording.transcriptionUsageReportId);
            if (!deliveredThisReceipt && !deliveredLegacy) {
                await settleCanonicalTranscription(recording.authSubject, receipt, db);
                await incrementTranscriptionUsed(recording.authSubject, receipt.consumedSeconds, receipt.id, db, receipt.acceptedAt);
            }
            const saved = await db.collection<Recording>(Collections.RECORDINGS).updateOne(fence, {
                $set: { 'transcriptionReceipt.queuedAt': new Date(),
                    ...(!deliveredLegacy ? { transcriptionUsageReportId: receipt.id, transcriptionUsageReportedAt: new Date() } : {}) },
                $unset: { transcriptionSettlementRepair: '' },
            });
            if (saved.matchedCount) count++;
        } catch (error) {
            // Preserve the unresolved receipt and its funds. Backoff plus oldest-
            // check ordering lets other canonical receipts repair independently.
            await db.collection<Recording>(Collections.RECORDINGS).updateOne(fence, { $set: { transcriptionSettlementRepair: {
                checkedAt: new Date(), retryAt: new Date(Date.now() + 5 * 60_000),
                error: (error instanceof Error ? error.message : 'Audio settlement requires reconciliation.').slice(0, 300),
            } } });
        }
    }
    return count;
}
export const managedCatalogVersion = BILLING_CATALOG.version;

import { BILLING_CATALOG, managedProvider } from './catalog';
import { quoteUsageQuantity, type UsageTariffSnapshot, type UsageTariffPair } from './usage-tariff';
import type { ProcessingTranscriptEnvelope } from './legacy-processing-budget';
import { assertExternalProcessingBound, processingAiCostBound, processingCostModels } from './processing-cost-bound';

export interface AiCostRate {
    inputUsdMicrosPerMillionTokens: number;
    outputUsdMicrosPerMillionTokens: number;
    cachedInputUsdMicrosPerMillionTokens?: number;
}
export interface ManagedCostPolicy {
    version: string;
    reviewedAt: string;
    expiresAt: string;
    paymentFeeBasisPoints: number;
    paymentFixedMicros: number;
    stripeBillingFeeBasisPoints?: number;
    stripeBillingFixedMicros?: number;
    minimumTopupMicros: number;
    recoveryReserveMicros: number;
    lifetimeHostingReserveMicros: number;
    infrastructureMicrosPerAudioMinute: number;
    infrastructureMicrosPerGiB: number;
    aiBundleMicrosPerAudioMinute: number;
    aiBundleFixedMicros: number;
    storageCostMicrosPerGiBMonth: number;
    storageOperationsMicrosPerGiBMonth: number;
    providers: Record<string, { costMicrosPerAudioMinute: number; fixedMicros: number }>;
    ai: Record<string, AiCostRate>;
    exports: { fixedMicros: number; perGiBMicros: number; maximumSourceBytes: number; recoveryReserveMicros: number };
    /** Additional audited Lifetime costs for failed attempts, exports and recovery not already in other caps. */
    lifetimeUsage?: { audioOverheadMicrosPerMinute: number; recordingOverheadMicros: number; storageOverheadMicrosPerGiBMonth: number };
    operatorFunding?: { trialLifetimeMicros: number; grantLifetimeMicros: number; calendarMonthMicros: number; trialStorageReserveMicros?: number };
    processingBounds?: Record<string, { envelope: ProcessingTranscriptEnvelope }>;
}
function nonnegative(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
/** Missing, expired or incomplete evidence never enables sales implicitly. No public rate is treated as an audited cost cap. */
export function getManagedCostPolicy(): ManagedCostPolicy {
    let policy: ManagedCostPolicy;
    try { policy = JSON.parse(process.env.MANAGED_COST_POLICY_JSON || '') as ManagedCostPolicy; }
    catch { throw new Error('Managed billing requires an audited MANAGED_COST_POLICY_JSON before paid operations are available.'); }
    if (!policy.version || !Number.isFinite(Date.parse(policy.reviewedAt)) || Date.parse(policy.reviewedAt) > Date.now()
        || !Number.isFinite(Date.parse(policy.expiresAt)) || Date.parse(policy.expiresAt) <= Date.now()
        || !['paymentFeeBasisPoints', 'paymentFixedMicros', 'minimumTopupMicros', 'recoveryReserveMicros', 'lifetimeHostingReserveMicros', 'infrastructureMicrosPerAudioMinute', 'infrastructureMicrosPerGiB', 'aiBundleMicrosPerAudioMinute', 'aiBundleFixedMicros', 'storageCostMicrosPerGiBMonth', 'storageOperationsMicrosPerGiBMonth'].every(key => nonnegative(policy[key as keyof ManagedCostPolicy]))
        || policy.recoveryReserveMicros <= 0 || policy.lifetimeHostingReserveMicros <= 0
        || policy.paymentFeeBasisPoints >= 10_000 || policy.minimumTopupMicros < 500_000 || !policy.providers || !policy.ai
        || !policy.exports || !Object.values(policy.exports).every(nonnegative) || policy.exports.maximumSourceBytes <= 0 || policy.exports.recoveryReserveMicros <= 0) {
        throw new Error('Managed cost evidence is incomplete or expired. Review costs before enabling paid operations.');
    }
    return policy;
}
export function getAiCostRate(provider: string, model: string, step?: string): AiCostRate {
    const policy = getManagedCostPolicy();
    const rate = policy.ai[`${provider}:${model}:${step}`] || policy.ai[`${provider}:${model}`];
    if (!rate || !nonnegative(rate.inputUsdMicrosPerMillionTokens) || !nonnegative(rate.outputUsdMicrosPerMillionTokens)
        || (rate.cachedInputUsdMicrosPerMillionTokens !== undefined && !nonnegative(rate.cachedInputUsdMicrosPerMillionTokens))) {
        throw new Error('This AI model has no audited cost schedule.');
    }
    return rate;
}
export function calculateAiCostMicros(rate: AiCostRate, usage: { inputTokens: number; outputTokens: number; cachedInputTokens?: number; thoughtTokens?: number }): number {
    const cached = usage.cachedInputTokens || 0;
    const thought = usage.thoughtTokens || 0;
    if (![usage.inputTokens, usage.outputTokens, cached, thought].every(nonnegative) || cached > usage.inputTokens) throw new Error('Invalid AI usage receipt.');
    return Math.ceil(((usage.inputTokens - cached) * rate.inputUsdMicrosPerMillionTokens
        + cached * (rate.cachedInputUsdMicrosPerMillionTokens ?? rate.inputUsdMicrosPerMillionTokens)
        + (usage.outputTokens + thought) * rate.outputUsdMicrosPerMillionTokens) / 1_000_000);
}
export function estimateTranscriptionCostMicros(provider: string, model: string | undefined, durationSeconds: number): number {
    managedProvider(provider, model);
    const policy = getManagedCostPolicy();
    const rate = policy.providers[`${provider}:${model || managedProvider(provider).model}`] || policy.providers[provider];
    if (!rate || !nonnegative(rate.costMicrosPerAudioMinute) || !nonnegative(rate.fixedMicros)) throw new Error('This provider has no audited cost cap.');
    const cost = Math.ceil(durationSeconds / 60 * rate.costMicrosPerAudioMinute + rate.fixedMicros);
    if (!Number.isSafeInteger(cost) || cost <= 0) throw new Error('Invalid provider cost cap.');
    return cost;
}
export function assertManagedEconomicsReady(): ManagedCostPolicy {
    const policy = getManagedCostPolicy();
    for (const [provider, tariff] of Object.entries(BILLING_CATALOG.providers)) {
        estimateTranscriptionCostMicros(provider, tariff.model, 60);
    }
    return policy;
}

/** Fees follow the actual chargeable retail quantity; included usage creates no usage fee. */
export function estimateUsageFees(tariff: UsageTariffSnapshot, quantity: number, policy = getManagedCostPolicy()) {
    const retail = quoteUsageQuantity(tariff, quantity).floorMicros;
    if (!nonnegative(policy.paymentFeeBasisPoints) || policy.paymentFeeBasisPoints >= 10_000
        || !nonnegative(policy.paymentFixedMicros) || !nonnegative(policy.minimumTopupMicros) || policy.minimumTopupMicros <= 0
        || !nonnegative(policy.stripeBillingFeeBasisPoints) || policy.stripeBillingFeeBasisPoints >= 10_000) {
        throw new Error('A verified payment and Stripe Billing fee schedule is required.');
    }
    const billingFeeBudgetMicros = Math.ceil(retail * policy.stripeBillingFeeBasisPoints / 10_000);
    const processorFeeBudgetMicros = Math.ceil(retail * (policy.paymentFeeBasisPoints / 10_000 + policy.paymentFixedMicros / Math.min(policy.minimumTopupMicros, 5_000_000)));
    return { nominalRetailMicros: retail, feeBudgetMicros: billingFeeBudgetMicros + processorFeeBudgetMicros,
        billingFeeBudgetMicros, processorFeeBudgetMicros };
}

/** Administrative estimate only. A profit percentage never authorizes or rejects customer work. */
export function usageEconomics(tariff: UsageTariffSnapshot, quantity: number, allInCostMicros: number, policy = getManagedCostPolicy()) {
    if (!nonnegative(allInCostMicros)) throw new Error('A verified usage cost cap is required.');
    const fees = estimateUsageFees(tariff, quantity, policy);
    const estimatedCostMicros = allInCostMicros + fees.feeBudgetMicros;
    if (!Number.isSafeInteger(estimatedCostMicros)) throw new Error('Usage cost exceeds the supported range.');
    const contributionMicros = fees.nominalRetailMicros - estimatedCostMicros;
    return { ...fees, estimatedCostMicros, contributionMicros,
        ...(fees.nominalRetailMicros > 0 ? { contributionBps: Math.floor(contributionMicros / fees.nominalRetailMicros * 10_000) } : {}) };
}

/** @deprecated Use usageEconomics for advisory reporting or estimateUsageFees for funding. */
export const assertUsageCostMargin = usageEconomics;

/** Publication requires finite cost evidence and request bounds, never a minimum retail rate. */
export function assertPublishedUsageCostEvidence(pair: UsageTariffPair, policy = getManagedCostPolicy()): void {
    if (!nonnegative(policy.stripeBillingFeeBasisPoints) || policy.stripeBillingFeeBasisPoints >= 10_000 || !nonnegative(policy.stripeBillingFixedMicros)) {
        throw new Error('Audit Stripe Billing application and invoice fees before publishing paid usage prices.');
    }
    if (policy.stripeBillingFixedMicros !== 0) {
        throw new Error('Nonzero fixed Stripe Billing fees require per-invoice actual cost attribution before paid offers can be published.');
    }
    if (pair.transcription.usageTier === 'lifetime' || pair.storage.usageTier === 'lifetime') lifetimeOperatingCosts(policy);
    for (const provider of Object.keys(BILLING_CATALOG.providers)) publishedProviderCostMicros(provider, pair, policy);
    publishedStorageCostMicros(pair, policy);
}

/** @deprecated Use assertPublishedUsageCostEvidence; no retail price floor is enforced. */
export const assertPublishedUsageCostFloor = assertPublishedUsageCostEvidence;

function lifetimeOperatingCosts(policy: ManagedCostPolicy): NonNullable<ManagedCostPolicy['lifetimeUsage']> {
    const costs = policy.lifetimeUsage;
    if (!costs || !['audioOverheadMicrosPerMinute', 'recordingOverheadMicros', 'storageOverheadMicrosPerGiBMonth']
        .every(field => nonnegative(costs[field as keyof typeof costs]))) throw new Error('Audit all Lifetime failure, export and recovery overhead costs before publishing this usage offer.');
    return costs;
}

/** Shared publication/review basis: one 15-second recording, including its bounded fixed work. */
export function publishedProviderCostMicros(provider: string, pair: UsageTariffPair, policy = getManagedCostPolicy()): number {
    const tariff = managedProvider(provider), rate = policy.providers[`${provider}:${tariff.model}`] || policy.providers[provider];
    if (!rate) throw new Error('A provider cost schedule is required.');
    const envelope = policy.processingBounds?.[`${provider}:${tariff.model}`]?.envelope;
    assertExternalProcessingBound(envelope, { provider, model: tariff.model });
    const aiCost = processingAiCostBound(envelope, processingCostModels(policy));
    const operating = pair.transcription.usageTier === 'lifetime' ? lifetimeOperatingCosts(policy) : undefined;
    return envelope.externalAsrCostBoundMicros! + aiCost + Math.ceil(tariff.maximumFileBytes / 1024 ** 3 * policy.infrastructureMicrosPerGiB) + Math.ceil((policy.infrastructureMicrosPerAudioMinute
        + (operating?.audioOverheadMicrosPerMinute || 0)) / 4)
        + (operating?.recordingOverheadMicros || 0);
}

/** Shared publication/review basis: one GiB of monthly chargeable peak. */
export function publishedStorageCostMicros(pair: UsageTariffPair, policy = getManagedCostPolicy()): number {
    const operating = pair.storage.usageTier === 'lifetime' ? lifetimeOperatingCosts(policy) : undefined;
    return policy.storageCostMicrosPerGiBMonth + policy.storageOperationsMicrosPerGiBMonth
        + (operating?.storageOverheadMicrosPerGiBMonth || 0);
}

/** Audited network, provider file staging and temporary-copy footprint; separate from retained storage. */
export function estimateTranscriptionInfrastructureMicros(durationSeconds: number, fileSize: number): number {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isSafeInteger(fileSize) || fileSize <= 0) throw new Error('Verified audio duration and file size are required for cost admission.');
    const policy = getManagedCostPolicy();
    const result = Math.ceil(durationSeconds / 60 * policy.infrastructureMicrosPerAudioMinute + fileSize / 1073741824 * policy.infrastructureMicrosPerGiB);
    if (!Number.isSafeInteger(result)) throw new Error('Infrastructure cost exceeds the supported range.');
    return result;
}

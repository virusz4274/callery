/** Public tariff only. Credentials, cost policy and account balances never belong here. */
export const BILLING_CATALOG = {
    version: '2026-10-21-v4', currency: 'usd',
    providers: {
        soniox: { multiplier: 1, model: 'stt-async-v5', maximumAudioSeconds: 18_000, maximumFileBytes: 2_147_483_648 },
        gemini: { multiplier: 3, model: 'gemini-3.5-transcribe', maximumAudioSeconds: 1800, maximumFileBytes: 2_147_483_648 },
        elevenlabs: { multiplier: 5, model: 'scribe_v2', maximumAudioSeconds: 36_000, maximumFileBytes: 2_147_483_648 },
    },
    meters: {
        storage: { eventName: 'storage_peak_milligib_v2' },
        transcription: { eventName: 'transcription_weighted_blocks_v2' },
    },
    lifetime: {
        meters: {
            storage: { eventName: 'storage_peak_milligib_lifetime_v2' },
            transcription: { eventName: 'transcription_weighted_blocks_lifetime_v2' },
        },
    },
} as const;
export type ManagedProvider = keyof typeof BILLING_CATALOG.providers;
export type UsagePricingTier = 'recurring' | 'lifetime';
/** Only the verified entitlement selects the Lifetime tariff. A selected plan is not purchase evidence. */
export function usagePricingTier(user: { billingEntitlement?: { source?: string } }): UsagePricingTier {
    return user.billingEntitlement?.source === 'lifetime' ? 'lifetime' : 'recurring';
}
export function getUsageMeterDefinitions(tier: UsagePricingTier) {
    return tier === 'lifetime' ? BILLING_CATALOG.lifetime.meters : BILLING_CATALOG.meters;
}
export const MICROS_PER_CENT = 10_000;
export function managedProvider(provider: string, model?: string) {
    if (!Object.hasOwn(BILLING_CATALOG.providers, provider)) throw new Error('This transcription provider is not available in the managed catalog.');
    const entry = BILLING_CATALOG.providers[provider as ManagedProvider];
    const normalized = model?.replace(/^models\//, '');
    if (normalized && normalized !== entry.model) {
        throw new Error('This model is not in the priced managed catalog.');
    }
    return entry;
}
export function weightedBlocks(durationSeconds: number, multiplier: number): number {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || ![1, 3, 5].includes(multiplier)) throw new Error('Invalid managed transcription quantity.');
    const value = Math.ceil(durationSeconds / 15) * multiplier;
    if (!Number.isSafeInteger(value)) throw new Error('Transcription quantity exceeds the supported limit.');
    return value;
}
export function storageMilliGiB(bytes: number): number {
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid storage quantity.');
    return Number((BigInt(bytes) * BigInt(1000) + BigInt(1073741823)) / BigInt(1073741824));
}

export function assertManagedTranscriptionLimits(provider: string, model: string | undefined, durationSeconds: number, fileSize: number) {
    const tariff = managedProvider(provider, model);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isSafeInteger(fileSize) || fileSize <= 0) throw new Error('Managed transcription requires verified duration and byte size.');
    if (durationSeconds > tariff.maximumAudioSeconds) throw new Error(`This provider supports recordings up to ${tariff.maximumAudioSeconds / 60} minutes. Choose another provider or split this recording.`);
    if (fileSize > tariff.maximumFileBytes) throw new Error('This provider supports files up to 2 GiB.');
    return tariff;
}

/** First-setup examples only. Imported Stripe prices are the live financial authority. */
export const INITIAL_RETAIL_SEED = { recurring: { storage: '0.02', transcription: '0.25' }, lifetime: { storage: '0.02', transcription: '0.25' } } as const;

'use server';

import { billingEnabled, transcriptionPricing } from '@/lib/config';
import { effectiveTranscriptionProvider, resolveEffectiveTranscriptionPolicy } from '@/lib/transcription-multipliers';

import { TranscriptionFactory, TranscriptionProviderId } from '@/services/transcription/factory';
import { getSystemSettings } from '@/lib/db/users';

export interface AvailableProvider {
    id: TranscriptionProviderId;
    name: string;
    description: string;
    multiplier: number;
}

/**
 * Get available transcription providers (only those with API keys configured)
 */
export async function getAvailableProviders(): Promise<AvailableProvider[]> {
    const availableConfigs = TranscriptionFactory.getAvailableProviders();

    // Get admin-configured multipliers
    const settings = await getSystemSettings();
    const managed = billingEnabled();
    const policy = resolveEffectiveTranscriptionPolicy(managed, managed ? {} : transcriptionPricing(), settings?.transcriptionMultipliers);

    const team = settings?.team;
    return availableConfigs.filter(config => policy.multipliers[config.id] !== undefined && (!team?.enabled || (team.transcriptionMode !== 'off' && config.id === team.transcriptionProvider))).map((config) => ({
        id: config.id,
        name: config.name,
        description: config.description,
        multiplier: effectiveTranscriptionProvider(policy, config.id).multiplier,
    }));
}

/**
 * Get multiplier for a specific provider
 */
export async function getProviderMultiplier(provider: TranscriptionProviderId): Promise<number> {
    const settings = await getSystemSettings();
    const managed = billingEnabled();
    const policy = resolveEffectiveTranscriptionPolicy(managed, managed ? {} : transcriptionPricing(), settings?.transcriptionMultipliers);
    return effectiveTranscriptionProvider(policy, provider).multiplier;
}

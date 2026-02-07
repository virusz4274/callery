'use server';

import { TranscriptionFactory, PROVIDER_CONFIGS, TranscriptionProviderId } from '@/services/transcription/factory';
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
    const adminMultipliers = settings?.transcriptionMultipliers;

    return availableConfigs.map((config) => ({
        id: config.id,
        name: config.name,
        description: config.description,
        multiplier: adminMultipliers?.[config.id] ?? config.defaultMultiplier,
    }));
}

/**
 * Get multiplier for a specific provider
 */
export async function getProviderMultiplier(provider: TranscriptionProviderId): Promise<number> {
    const settings = await getSystemSettings();
    const adminMultipliers = settings?.transcriptionMultipliers;

    if (adminMultipliers?.[provider] !== undefined) {
        return adminMultipliers[provider];
    }

    return PROVIDER_CONFIGS[provider]?.defaultMultiplier ?? 1.0;
}

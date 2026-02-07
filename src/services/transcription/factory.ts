
import { ITranscriptionService } from './types';
import { SonioxService } from './soniox-service';
import { ElevenLabsService } from './elevenlabs-service';

export type TranscriptionProviderId = 'soniox' | 'elevenlabs';

export interface ProviderConfig {
    id: TranscriptionProviderId;
    name: string;
    description: string;
    defaultMultiplier: number;
    envKey: string;
}

export const PROVIDER_CONFIGS: Record<TranscriptionProviderId, ProviderConfig> = {
    soniox: {
        id: 'soniox',
        name: 'Soniox (Standard)',
        description: 'Fast and accurate, 1x cost',
        defaultMultiplier: 1.0,
        envKey: 'SONIOX_API_KEY',
    },
    elevenlabs: {
        id: 'elevenlabs',
        name: 'ElevenLabs (Premium)',
        description: 'Highest accuracy, 6x cost',
        defaultMultiplier: 6.0,
        envKey: 'ELEVENLABS_API_KEY',
    },
};

export class TranscriptionFactory {
    static getService(provider: TranscriptionProviderId): ITranscriptionService {
        switch (provider) {
            case 'elevenlabs':
                return new ElevenLabsService();
            case 'soniox':
                return new SonioxService();
            default:
                throw new Error(`Unknown transcription provider: ${provider}`);
        }
    }

    /**
     * Returns list of providers that have API keys configured.
     */
    static getAvailableProviders(): ProviderConfig[] {
        return Object.values(PROVIDER_CONFIGS).filter(
            (config) => !!process.env[config.envKey]
        );
    }

    /**
     * Check if a specific provider is available.
     */
    static isProviderAvailable(provider: TranscriptionProviderId): boolean {
        const config = PROVIDER_CONFIGS[provider];
        return !!process.env[config.envKey];
    }
}

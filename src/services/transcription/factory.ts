import { compatTranscriptionConfig, geminiApiKey, transcriptionMultiplier, type TranscriptionProvider } from '@/lib/config';
import { getTranscriptionService } from './index';
import type { ITranscriptionService } from './types';
export type TranscriptionProviderId = TranscriptionProvider;
export interface ProviderConfig {
    id: TranscriptionProviderId;
    name: string;
    description: string;
    defaultMultiplier: number;
    envKey: string;
}
export const PROVIDER_CONFIGS: Record<TranscriptionProviderId, ProviderConfig> = {
    soniox: { id: 'soniox', name: 'Soniox', description: 'Cloud transcription with speaker detection', defaultMultiplier: 1, envKey: 'SONIOX_API_KEY' },
    elevenlabs: { id: 'elevenlabs', name: 'ElevenLabs', description: 'Cloud transcription with speaker detection', defaultMultiplier: 5, envKey: 'ELEVENLABS_API_KEY' },
    gemini: { id: 'gemini', name: 'Gemini', description: 'Audio transcription through Gemini', defaultMultiplier: 0.5, envKey: 'GOOGLE_GENERATIVE_AI_API_KEY' },
    openai_compat: { id: 'openai_compat', name: 'Compatible server', description: 'Use your own Whisper API server', defaultMultiplier: 0.1, envKey: 'TRANSCRIPTION_COMPAT_BASE_URL' },
};
export class TranscriptionFactory {
    static getService(provider: TranscriptionProviderId): ITranscriptionService {
        return getTranscriptionService({ transcriptionSettings: { defaultProvider: provider } }).service;
    }
    static isProviderAvailable(provider: TranscriptionProviderId): boolean {
        if (provider === 'openai_compat') return !!compatTranscriptionConfig();
        if (provider === 'gemini') return !!geminiApiKey();
        const config = PROVIDER_CONFIGS[provider];
        return !!config && !!process.env[config.envKey];
    }
    static getAvailableProviders(): ProviderConfig[] {
        return Object.values(PROVIDER_CONFIGS).filter(c => this.isProviderAvailable(c.id)).map(c => ({ ...c, defaultMultiplier: transcriptionMultiplier(c.id) }));
    }
}

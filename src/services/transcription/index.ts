import { transcriptionMultiplier, transcriptionProvider, type TranscriptionProvider } from '@/lib/config';
import { ElevenLabsService } from './elevenlabs-service';
import { GeminiTranscriptionService } from './gemini-transcription-service';
import { OpenAiCompatTranscriptionService } from './openai-compat-service';
import { SonioxService } from './soniox-service';
import type { ITranscriptionService } from './types';

export type { ITranscriptionService, TranscriptionResult } from './types';

/** Minimal shape needed to resolve a user's provider override. */
export interface ProviderOverride {
    transcriptionSettings?: { defaultProvider?: unknown } | null;
}

/**
 * Resolve the effective provider: per-user override wins, otherwise the
 * instance TRANSCRIPTION_PROVIDER default. Unknown override values fall back
 * to the default instead of failing.
 */
export function resolveTranscriptionProvider(user?: ProviderOverride | null): TranscriptionProvider {
    const override = user?.transcriptionSettings?.defaultProvider;
    if (override === 'soniox' || override === 'elevenlabs' || override === 'gemini' || override === 'openai_compat') {
        return override;
    }
    return transcriptionProvider();
}

const services: Partial<Record<TranscriptionProvider, ITranscriptionService>> = {};

/**
 * Resolve the transcription service for a user (override-aware) together
 * with the provider name it was resolved to (needed for metering).
 */
export function getTranscriptionService(user?: ProviderOverride | null): {
    service: ITranscriptionService;
    provider: TranscriptionProvider;
} {
    const provider = resolveTranscriptionProvider(user);
    if (!services[provider]) {
        services[provider] =
            provider === 'elevenlabs'
                ? new ElevenLabsService()
                : provider === 'gemini'
                  ? new GeminiTranscriptionService()
                  : provider === 'openai_compat'
                    ? new OpenAiCompatTranscriptionService()
                    : new SonioxService();
    }
    return { service: services[provider] as ITranscriptionService, provider };
}

export { transcriptionMultiplier };
export type { TranscriptionProvider };

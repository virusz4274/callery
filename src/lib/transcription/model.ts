import { billingEnabled, compatTranscriptionConfig, geminiModel, type TranscriptionProvider } from '@/lib/config';
import { managedProvider } from '@/lib/stripe/catalog';

/** Resolve once when approving work; the worker must honor the reviewed model. */
export function defaultTranscriptionModel(provider: TranscriptionProvider): string | undefined {
    if (billingEnabled()) return managedProvider(provider).model;
    switch (provider) {
        case 'gemini': return geminiModel('transcription');
        case 'openai_compat': return compatTranscriptionConfig()?.model;
        case 'soniox': return process.env.SONIOX_MODEL_ID || undefined;
        case 'elevenlabs': return process.env.ELEVENLABS_MODEL_ID || undefined;
    }
}

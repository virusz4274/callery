import { TranscriptionSegment } from '@/lib/db/types';

export type AiStep = 'summary' | 'transliteration' | 'embedding';
/** Exact, server-created request. The transport must not substitute a model or enlarge limits. */
export interface PlannedAiRequest {
    version: 1;
    id: string;
    provider: 'gemini' | 'openai_compat';
    model: string;
    prompt: string;
    promptVersion: string;
    inputTokens: number;
    maxOutputTokens: number;
    /** Output cap includes reasoning tokens; minimal does not mean free thinking. */
    thinking: 'off' | 'minimal';
}
export interface AiUsage {
    provider: 'gemini' | 'openai_compat';
    model: string;
    actualModel?: string;
    step: AiStep;
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    thoughtTokens?: number;
    requestId?: string;
    measured: boolean;
}

/**
 * Optional provenance for admin-side failure events. AI methods degrade
 * gracefully on failure (empty summary, passthrough segments, empty vector)
 * and log an AI_STEP_FAILED audit event; the context pins it to a user and
 * recording when the caller knows them.
 */
export interface AiStepContext {
    recordingId?: string;
    authSubject?: string;
    /** Durable transcription jobs must surface failures instead of consuming more work. */
    throwOnError?: boolean;
    /** Persist usage before parsing/checkpointing the provider's output. */
    onUsage?: (usage: AiUsage) => Promise<void>;
    reservationId?: string;
    fundingSource?: 'customer' | 'trial' | 'grant' | 'internal' | 'selfhost';
    plannedRequest?: PlannedAiRequest;
}

export interface IAIService {
    /** Provider tokenizer over the exact transmitted contents; never a words/token estimate. */
    countInputTokens?(model: string, contents: string): Promise<number>;
    /**
     * Generates a concise summary of the transcript.
     * @param transcript The full text transcript
     * @param languageCode The ISO language code of the transcript
     */
    generateSummary(transcript: string, languageCode: string, context?: AiStepContext): Promise<string>;

    /**
     * Transliterates transcription segments into English characters (e.g. Manglish).
     * @param segments Array of transcription segments
     * @param languageCode The ISO language code of the input text
     */
    generateTransliteration(
        segments: TranscriptionSegment[],
        languageCode: string,
        context?: AiStepContext
    ): Promise<TranscriptionSegment[]>;

    /**
     * Generates a vector embedding for the given text.
     * @param text The text to embed
     */
    generateEmbedding(text: string, context?: AiStepContext): Promise<number[]>;
}

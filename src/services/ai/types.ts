import { TranscriptionSegment } from '@/lib/db/types';

/**
 * Optional provenance for admin-side failure events. AI methods degrade
 * gracefully on failure (empty summary, passthrough segments, empty vector)
 * and log an AI_STEP_FAILED audit event; the context pins it to a user and
 * recording when the caller knows them.
 */
export interface AiStepContext {
    recordingId?: string;
    authSubject?: string;
}

export interface IAIService {
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

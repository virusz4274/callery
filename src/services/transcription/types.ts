import { TranscriptionSegment } from '@/lib/db/types';

export interface TranscriptionResult {
    text: string;
    languageCode: string;
    segments: TranscriptionSegment[];
    transcriptionId: string;

    // Metadata for debugging/storage
    provider: 'soniox' | 'elevenlabs' | 'gemini' | 'openai_compat';
    model: string;
    /** Provider-reported usage; absence is never treated as a zero-cost request. */
    usage?: { measured: boolean; inputTokens?: number; outputTokens?: number; thoughtTokens?: number;
        cachedInputTokens?: number; requestId?: string; actualModel?: string };
}

export interface TranscribeOptions {
    processingEnvelope?: import('@/lib/transcription/processing-policy').ProcessingTranscriptEnvelope;
    /** Financial correlation only; never audio, transcript, or personal data. */
    billingReceiptId?: string;
    /** Capture incurred usage even when parsing/truncation rejects the transcript. */
    onUsage?: (usage: NonNullable<TranscriptionResult['usage']>) => void | Promise<void>;
    durationSeconds?: number;
    model?: string; // e.g. 'scribe_v2' or 'global' (Soniox)
}

export interface TranscribeAsyncOptions extends TranscribeOptions {
    webhookMetadata?: {
        recordingId: string;
        authSubject: string;
        jobId?: string;
        attemptId?: string;
    };
}

export interface TranscribeAsyncResult {
    requestId: string;
    transcriptionId?: string;
    message: string;
}

export interface ITranscriptionService {
    /**
     * Transcribe audio file from a URL.
     * @param fileUrl Accessible URL of the audio file (e.g. presigned S3/R2 url)
     */
    transcribe(fileUrl: string, options?: TranscribeOptions): Promise<TranscriptionResult>;

    /**
     * Delete transcription data from the provider (if applicable/required for privacy).
     * @param transcriptionId The ID returned in the TranscriptionResult
     */
    deleteTranscript(transcriptionId: string): Promise<void>;
}

export interface SonioxPollWord {
    text?: string;
    speaker?: number | string;
    start_ms?: number;
    end_ms?: number;
    confidence?: number;
}

export interface SonioxPollResponse {
    status: string;
    id: string;
    created_at: string;
    text?: string;
    words?: SonioxPollWord[];
    tokens?: SonioxPollWord[];
    speakers?: unknown[];
    error_message?: string;
    detected_language?: string;
}

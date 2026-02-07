import { TranscriptionSegment } from '@/lib/db/types';

export interface TranscriptionResult {
    text: string;
    languageCode: string;
    segments: TranscriptionSegment[];
    transcriptionId: string;

    // Metadata for debugging/storage
    provider: 'soniox' | 'elevenlabs';
    model: string;
}

export interface TranscribeOptions {
    durationSeconds?: number;
    model?: string; // e.g. 'scribe_v2' or 'global' (Soniox)
}

export interface TranscribeAsyncOptions extends TranscribeOptions {
    webhookMetadata?: {
        recordingId: string;
        firebaseUid: string;
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

export interface SonioxPollResponse {
    status: string;
    id: string;
    created_at: string;
    text?: string;
    words?: any[];
    tokens?: any[];
    speakers?: any[];
    error_message?: string;
    detected_language?: string;
}

import { TranscriptionSegment } from '@/lib/db/types';

export interface TranscriptionResult {
    text: string;
    languageCode: string;
    segments: TranscriptionSegment[];
    transcriptionId: string;
}

export interface ITranscriptionService {
    /**
     * Transcribe audio file from a URL.
     * @param fileUrl Accessible URL of the audio file (e.g. presigned S3/R2 url)
     */
    transcribe(fileUrl: string, durationSeconds?: number): Promise<TranscriptionResult>;

    /**
     * Delete transcription data from the provider (if applicable/required for privacy).
     * @param transcriptionId The ID returned in the TranscriptionResult
     */
    deleteTranscript(transcriptionId: string): Promise<void>;
}

export interface SonioxPollResponse {
    status: string;
    tokens?: {
        text: string;
        start_ms: number;
        end_ms: number;
        speaker: number;
        confidence: number;
    }[];
    words?: {
        text: string;
        start_ms: number;
        end_ms: number;
        speaker: number;
        confidence: number;
    }[];
    text?: string;
    detected_language?: string;
    error_message?: string;
}

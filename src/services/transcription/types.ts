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

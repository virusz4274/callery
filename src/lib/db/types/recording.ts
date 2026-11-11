import { ObjectId } from 'mongodb';
import type { TranscriptionBillingContext } from '@/lib/stripe/usage';
import type { AiStep, AiUsage } from '@/services/ai/types';
import type { ProcessingStatus } from '@/lib/transcription/processing-errors';
import type { AiWorkPlan, AiCallCheckpoint } from '@/lib/transcription/ai-work-plan';

export interface TranscriptionWord {
    text: string;
    start?: number;  // in seconds
    end?: number;    // in seconds
    speakerId?: string;
    confidence?: number;  // Soniox confidence score (0-1)
}

export interface TranscriptionSegment {
    speakerId: string;
    text: string;
    start?: number;
    end?: number;
    words: TranscriptionWord[];
    transliteratedText?: string;
}

/**
 * Recording document stored in MongoDB.
 */
export interface Recording {
    /** Embedding-only rebuild checkpoints; personal content, never a billing receipt. */
    searchIndexWork?: import('@/lib/search/reindex').SearchIndexWork;
    _id: ObjectId;
    authSubject: string;
    contactId: ObjectId | null;
    contactName: string | null;
    phoneNumber: string;
    normalizedPhoneNumber: string;
    /** How the caller was identified. Only set for new uploads; never exposed in API responses. */
    contactMatchSource?: 'phone' | 'name';

    // File metadata
    r2Key: string;
    /** Durable ingestion identity. Absent on recordings created before API v1. */
    ingestionId?: string;
    /** Bulk imports stay held until an explicitly approved transcription batch runs them. */
    bulkImportId?: string;
    transcriptionBatchId?: string;
    /** Validated filename calendar day; null means no trustworthy call timestamp was found. */
    recordingDateKey?: string | null;
    integration?: { source?: string; externalId?: string; metadata?: Record<string, unknown>; fingerprint: string };
    fileName: string;
    fileSize: number;
    mimeType: string;
    duration: number;

    // Additional file metadata (new)

    standardizedDisplayName: string;

    // Timestamps
    recordedAt: Date;
    createdAt: Date;
    updatedAt: Date;

    // Transcription
    transcriptionStatus: 'pending' | 'processing' | 'completed' | 'failed';
    processingStatus?: ProcessingStatus;
    /** Recoverable payloads live with personal recording content and are erased with it. */
    aiWorkPlan?: AiWorkPlan | null;
    aiWorkCheckpoints?: Record<string, AiCallCheckpoint>;
    aiWorkRevision?: number;
    /** Durable dispatcher and execution attempt used to reconcile provider callbacks. */
    transcriptionJobId?: string;
    /** Server-only queue journal identity, projected as public queued processing state. */
    transcriptionQueuedJobId?: string;
    transcriptionAttemptId?: string;
    transcriptionError?: string;
    /** A saved transcript may still need summaries, transliteration or embeddings. */
    transcriptionEnrichmentPending?: boolean;
    /** Identifies the saved provider result even if the webhook completion receipt is retried. */
    transcriptionResultAttemptId?: string;
    /** Recover the accept-result → queue-enrichment handoff on standalone MongoDB. */
    transcriptionCompletionPending?: { jobId: string; attemptId: string };
    transcriptionEnrichmentSteps?: { summary?: boolean; transliteration?: boolean; embedding?: boolean };
    /** Server-only paid attempt/usage checkpoints, scoped to one saved STT result. */
    transcriptionEnrichmentCosts?: { resultId: string; maximumCostMicros?: number; consumedCostMicros?: number; summaryInputTruncated?: boolean; completedChunks?: number[]; chunks?: Record<number, {
        attempts: number; state: 'in_flight' | 'failed' | 'completed'; reservationId?: string; usage?: AiUsage; actualCostMicros?: number;
    }>; steps: Partial<Record<AiStep, {
        attempts: number; state: 'in_flight' | 'failed' | 'completed'; reservationId?: string; usage?: AiUsage; actualCostMicros?: number;
    }>> };
    fullTranscript?: TranscriptionSegment[]; // Structured transcript with diarization
    languageCode?: string; // e.g. 'mal', 'eng'

    // Transcription Metadata
    transcriptionProvider?: 'soniox' | 'elevenlabs' | 'gemini' | 'openai_compat';
    transcriptionModel?: string;
    transcriptionCostMultiplier?: number;
    externalTranscriptionId?: string; // For webhook correlation with external providers
    transcriptionUsageReportId?: string;
    transcriptionUsageReportedAt?: Date;
    /** Server-only snapshot of the paid account that authorized this provider attempt. */
    transcriptionBillingContext?: TranscriptionBillingContext | null;
    /** Immutable monetary/allowance receipt of the original audio submission. Never replaced by enrichment retries. */
    transcriptionReceipt?: import('@/lib/stripe/transcription-receipt').TranscriptionReceipt;
    transcriptionLegacyBilling?: { state: 'settled' | 'unmetered' | 'review'; reason?: string; receiptIds: string[]; reviewedAt: Date };

    // Summary & Embeddings
    summary?: string; // English summary for search
    searchIndex?: import('@/lib/search/types').RecordingSearchIndex;
    // Metadata
    tags: string[];
    isStarred: boolean;
    isArchived: boolean;
}

export type CreateRecordingInput = Omit<Recording, '_id' | 'createdAt' | 'updatedAt' | 'normalizedPhoneNumber'>;
export type UpdateRecordingInput = Partial<Omit<Recording, '_id' | 'authSubject' | 'createdAt'>>;

export interface RecordingResponse {
    transcriptRevision?: string;
    searchIndex?: import('@/lib/search/types').RecordingSearchIndex;
    processingProgress?: import('@/lib/transcription/progress').ProcessingProgress;
    processingStatus?: ProcessingStatus;
    /** Only set by the administrator company archive query. */
    uploaderName?: string;
    id: string;
    authSubject: string;
    contactId: string | null;
    contactName: string | null;
    phoneNumber: string;
    r2Key: string;
    fileName: string;
    standardizedDisplayName: string;
    fileSize: number;
    mimeType: string;
    duration: number;
    recordedAt: string;
    bulkImportId?: string;
    transcriptionBatchId?: string;
    recordingDateKey?: string | null;
    createdAt: string;
    updatedAt: string;
    transcriptionStatus: 'pending' | 'processing' | 'completed' | 'failed';
    fullTranscript?: TranscriptionSegment[];
    languageCode?: string;
    transcriptionProvider?: 'soniox' | 'elevenlabs' | 'gemini' | 'openai_compat';
    transcriptionModel?: string;
    transcriptionCostMultiplier?: number;
    summary?: string;
    tags: string[];
    isStarred: boolean;
    isArchived: boolean;
    /** Signed URL for playback (generated on request) */
    playbackUrl?: string;
}

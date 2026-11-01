import type { TranscriptionProviderId } from '@/services/transcription/factory';
import type { ProcessingStatus } from './processing-errors';

export type BatchStatus = 'draft' | 'running' | 'paused' | 'completed' | 'needs_review';

export interface WaitingRecording {
    id: string;
    fileName: string;
    displayName: string;
    duration: number;
    recordedAt: string;
    /** Calendar date from the filename, independent of the viewer's timezone. */
    dateKey: string | null;
    importId: string;
}

export interface BatchRecording extends WaitingRecording {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    jobState?: 'pending' | 'running' | 'submitted' | 'completed' | 'failed' | 'needs_review';
    error?: string;
    processingStatus?: ProcessingStatus;
    processingProgress?: import('./progress').ProcessingProgress;
}

export interface BatchResponse {
    id: string;
    name: string;
    dateKey: string | null;
    recordingIds: string[];
    recordings: BatchRecording[];
    provider: TranscriptionProviderId;
    model?: string;
    status: BatchStatus;
    createdAt: string;
    updatedAt: string;
    totalDuration: number;
    completedCount: number;
    failedCount: number;
    error?: string;
}

export interface TranscriptionImport {
    _id: string;
    owner: string;
    createdAt: Date;
}

export interface BatchSelection {
    recordingIds: string[];
    name: string;
    dateKey: string | null;
    provider: TranscriptionProviderId;
    model?: string;
    totalDuration: number;
}

export interface TranscriptionBatch extends BatchSelection {
    _id: string;
    owner: string;
    status: BatchStatus;
    createdAt: Date;
    updatedAt: Date;
    error?: string;
    /** Saved before reserving recordings, allowing standalone MongoDB recovery. */
    reservationUpdate?: BatchSelection;
    reservationReleasePending?: boolean;
    removing?: boolean;
}

export interface TranscriptionWorkspace {
    waiting: WaitingRecording[];
    batches: BatchResponse[];
    providers: { id: TranscriptionProviderId; name: string; description: string; multiplier: number }[];
    waitingNextCursor: string | null;
    batchesNextCursor: string | null;
    waitingTotal: number;
    batchesTotal: number;
}

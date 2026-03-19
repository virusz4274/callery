import type { AudioFileInfo } from '@/lib/capacitor';

export type SyncStatus = 'pending' | 'queued' | 'retrying' | 'uploading' | 'finalizing' | 'synced' | 'error';

export interface SyncableFile extends AudioFileInfo {
    fingerprint: string;
    selected: boolean;
    status: SyncStatus;
    error?: string;
}

export interface SyncProgress {
    current: number;
    total: number;
    currentFileName: string;
    state?: 'queued' | 'running' | 'retrying' | 'completed' | 'completed_with_errors' | 'cancelled' | 'failed';
}

export type SortField = 'mtime' | 'size' | 'name';
export type SortDirection = 'asc' | 'desc';

'use client';

import { registerPlugin } from '@capacitor/core';

export interface BackgroundSyncFileInput {
    path: string;
    name: string;
    size: number;
    mtime: number;
    mimeType: string;
}

export interface BackgroundSyncStatus {
    state: 'idle' | 'queued' | 'running' | 'retrying' | 'cancelled' | 'completed' | 'completed_with_errors' | 'failed';
    isRunning: boolean;
    jobId: string | null;
    current: number;
    total: number;
    currentFileName: string;
    successCount: number;
    failCount: number;
    updatedAt: number;
}

export interface BackgroundSyncResultItem {
    jobId: string;
    folderId: string;
    path: string;
    name: string;
    size: number;
    mtime: number;
    status: 'synced' | 'error';
    recordingId?: string | null;
    error?: string | null;
    syncedAt: number;
}

interface BackgroundSyncPlugin {
    startSync(options: {
        serverUrl: string;
        authToken: string;
        folderId: string;
        files: BackgroundSyncFileInput[];
    }): Promise<{ jobId: string }>;
    getNotificationPermissionStatus(): Promise<{ granted: boolean }>;
    requestNotificationPermission(): Promise<{ granted: boolean }>;
    getStatus(): Promise<{ status: BackgroundSyncStatus }>;
    cancelSync(): Promise<{ cancelled: boolean }>;
    drainCompletedResults(): Promise<{ items: BackgroundSyncResultItem[] }>;
}

const BackgroundSync = registerPlugin<BackgroundSyncPlugin>('BackgroundSync');

export async function startBackgroundSync(options: {
    serverUrl: string;
    authToken: string;
    folderId: string;
    files: BackgroundSyncFileInput[];
}) {
    return BackgroundSync.startSync(options);
}

export async function getBackgroundSyncStatus(): Promise<BackgroundSyncStatus> {
    const result = await BackgroundSync.getStatus();
    return result.status;
}

export async function getBackgroundSyncNotificationPermissionStatus(): Promise<boolean> {
    const result = await BackgroundSync.getNotificationPermissionStatus();
    return !!result.granted;
}

export async function requestBackgroundSyncNotificationPermission(): Promise<boolean> {
    const result = await BackgroundSync.requestNotificationPermission();
    return !!result.granted;
}

export async function cancelBackgroundSync() {
    return BackgroundSync.cancelSync();
}

export async function drainBackgroundSyncResults(): Promise<BackgroundSyncResultItem[]> {
    const result = await BackgroundSync.drainCompletedResults();
    return result.items || [];
}

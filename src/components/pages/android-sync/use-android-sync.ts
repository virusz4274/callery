import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/toast-provider';
import { authFetchJson } from '@/lib/api-client';
import { clearFolderSyncHistory, markAsSynced } from '@/lib/sync-store';
import type { Folder } from '@/lib/capacitor';
import {
    cancelBackgroundSync,
    drainBackgroundSyncResults,
    getBackgroundSyncNotificationPermissionStatus,
    getBackgroundSyncStatus,
    requestBackgroundSyncNotificationPermission,
    startBackgroundSync,
    type BackgroundSyncResultItem,
} from '@/lib/background-sync';
import type { SyncProgress, SyncableFile } from './types';
import { syncAndroidFiles } from './sync-runner';
import { useSyncListState } from './use-sync-list-state';
import {
    clearSavedFolder,
    initAndroidSyncContext,
    loadCachedFolderFiles,
    loadFolderFiles,
    loadSyncStats,
    pickAndSaveFolder,
} from './sync-loader';

const BACKGROUND_SYNC_POLL_MS = 1000;
const BACKGROUND_SYNC_IDLE_POLL_MS = 10000;

type CreateMobileSyncSessionResponse = {
    success: boolean;
    syncToken: string;
};

export function useAndroidSync() {
    const { toast } = useToast();

    const [isCapacitor, setIsCapacitor] = useState<boolean | null>(null);
    const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
    const [files, setFiles] = useState<SyncableFile[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMode, setSyncMode] = useState<'background' | 'inline' | null>(null);
    const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
    const [syncedCount, setSyncedCount] = useState(0);
    const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
    const lastCompletedJobId = useRef<string | null>(null);

    useEffect(() => {
        async function init() {
            try {
                const context = await initAndroidSyncContext();
                setIsCapacitor(context.isCapacitor);
                if (context.selectedFolder) {
                    setSelectedFolder(context.selectedFolder);
                }
            } catch {
                setIsCapacitor(false);
            }
        }

        void init();
    }, []);

    const loadFolderStats = useCallback(async (folder: Folder) => {
        try {
            const stats = await loadSyncStats(folder);
            setSyncedCount(stats.syncedCount);
            setLastSyncTime(stats.lastSyncTime);
        } catch (error) {
            console.error('Error loading sync stats:', error);
        }
    }, []);

    useEffect(() => {
        if (selectedFolder) {
            void loadFolderStats(selectedFolder);
        }
    }, [loadFolderStats, selectedFolder]);

    const loadFiles = useCallback(async () => {
        if (!selectedFolder) {
            return;
        }

        setIsLoading(true);
        try {
            const cachedFiles = await loadCachedFolderFiles(selectedFolder);
            if (cachedFiles) {
                // Show cached results immediately so large folders feel responsive,
                // but keep an isRefreshing indicator while the fresh native scan runs.
                setFiles(cachedFiles);
                setIsLoading(false);
                setIsRefreshing(true);
            }

            const syncableFiles = await loadFolderFiles(selectedFolder);
            setFiles(syncableFiles);
            await loadFolderStats(selectedFolder);
        } catch (error) {
            console.error('Error loading files:', error);
            toast({ title: 'Error', description: 'Failed to load files from folder', status: 'danger' });
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [loadFolderStats, selectedFolder, toast]);

    useEffect(() => {
        if (selectedFolder && isCapacitor) {
            void loadFiles();
        }
    }, [isCapacitor, loadFiles, selectedFolder]);

    const listState = useSyncListState({ files, setFiles });

    const pickFolder = async () => {
        try {
            const folder = await pickAndSaveFolder();
            if (folder) {
                setFiles([]);
                setSyncedCount(0);
                setLastSyncTime(null);
                setSelectedFolder(folder);
            }
        } catch (error) {
            console.error('Error picking folder:', error);
            toast({ title: 'Error', description: 'Failed to select folder', status: 'danger' });
        }
    };

    const clearFolder = async () => {
        try {
            await clearSavedFolder();
            setSelectedFolder(null);
            setFiles([]);
            setSyncedCount(0);
            setLastSyncTime(null);
            setSyncProgress(null);
            setIsSyncing(false);
            setSyncMode(null);
        } catch (error) {
            console.error('Error clearing folder:', error);
        }
    };

    const applyBackgroundSyncResults = useCallback(async (items: BackgroundSyncResultItem[]) => {
        if (items.length === 0) {
            return;
        }

        const syncedItems = items.filter((item) => item.status === 'synced' && item.recordingId);
        if (syncedItems.length > 0) {
            await Promise.all(
                syncedItems.map((item) =>
                    markAsSynced(
                        item.folderId,
                        item.path,
                        item.name,
                        item.size,
                        item.mtime,
                        item.recordingId as string
                    )
                )
            );
        }

        setFiles((prev) =>
            prev.map((file) => {
                const result = items.find((item) => item.folderId === selectedFolder?.id && item.path === file.path);
                if (!result) {
                    return file;
                }

                if (result.status === 'synced') {
                    return {
                        ...file,
                        status: 'synced',
                        selected: false,
                        error: undefined,
                    };
                }

                return {
                    ...file,
                    status: 'error',
                    selected: true,
                    error: result.error || 'Upload failed',
                };
            })
        );

        if (selectedFolder) {
            await loadFolderStats(selectedFolder);
        }
    }, [loadFolderStats, selectedFolder]);

    useEffect(() => {
        if (!isCapacitor) {
            return;
        }

        let cancelled = false;
        let timeoutId: number | null = null;

        const pollBackgroundSync = async () => {
            try {
                const status = await getBackgroundSyncStatus();
                const items = await drainBackgroundSyncResults();

                if (cancelled) {
                    return;
                }

                if (items.length > 0) {
                    await applyBackgroundSyncResults(items);
                }

                const shouldShowSyncState = status.isRunning || status.state === 'queued' || status.state === 'retrying';
                const progressState =
                    status.state === 'queued' ||
                    status.state === 'running' ||
                    status.state === 'retrying' ||
                    status.state === 'completed' ||
                    status.state === 'completed_with_errors' ||
                    status.state === 'cancelled' ||
                    status.state === 'failed'
                        ? status.state
                        : undefined;
                setIsSyncing(shouldShowSyncState);
                setSyncProgress(
                    shouldShowSyncState
                        ? {
                            current: status.current,
                            total: status.total,
                            currentFileName: status.currentFileName,
                            state: progressState,
                        }
                        : null
                );

                const isTerminalState =
                    !status.isRunning &&
                    status.jobId &&
                    ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(status.state);

                if (isTerminalState && lastCompletedJobId.current !== status.jobId) {
                    lastCompletedJobId.current = status.jobId;
                    setSyncProgress(null);
                    setSyncMode(null);

                    if (status.successCount > 0) {
                        const message =
                            status.failCount > 0
                                ? `Synced ${status.successCount} files (${status.failCount} failed)`
                                : `Synced ${status.successCount} files`;

                        toast({
                            title: 'Background Sync Complete',
                            description: message,
                            status: status.failCount > 0 ? 'warning' : 'success',
                        });
                    } else if (status.state === 'cancelled') {
                        toast({
                            title: 'Background Sync Cancelled',
                            description: 'The background sync run was cancelled.',
                            status: 'warning',
                        });
                    } else if (status.failCount > 0) {
                        toast({
                            title: 'Background Sync Failed',
                            description: `Failed to sync ${status.failCount} files`,
                            status: 'danger',
                        });
                    }
                }

                if (!cancelled) {
                    const nextDelay =
                        status.isRunning || status.state === 'queued' || status.state === 'retrying'
                            ? BACKGROUND_SYNC_POLL_MS
                            : BACKGROUND_SYNC_IDLE_POLL_MS;
                    timeoutId = window.setTimeout(() => {
                        void pollBackgroundSync();
                    }, nextDelay);
                }
            } catch (error) {
                console.error('Error polling background sync:', error);
                if (!cancelled) {
                    timeoutId = window.setTimeout(() => {
                        void pollBackgroundSync();
                    }, BACKGROUND_SYNC_IDLE_POLL_MS);
                }
            }
        };

        void pollBackgroundSync();

        return () => {
            cancelled = true;
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
        };
    }, [applyBackgroundSyncResults, isCapacitor, toast]);

    const runInlineSync = useCallback(async (folder: Folder, selectedFiles: SyncableFile[]) => {
        setIsSyncing(true);
        setSyncMode('inline');
        setSyncProgress({ current: 0, total: selectedFiles.length, currentFileName: '', state: 'running' });

        const { successCount, failCount } = await syncAndroidFiles({
            selectedFolder: folder,
            selectedFiles,
            onProgress: (current, total, currentFileName) => {
                setSyncProgress({ current, total, currentFileName, state: 'running' });
            },
            onUploading: (path) => {
                setFiles((prev) =>
                    prev.map((file) =>
                        file.path === path ? { ...file, status: 'uploading', error: undefined } : file
                    )
                );
            },
            onSynced: (path) => {
                setFiles((prev) =>
                    prev.map((file) =>
                        file.path === path ? { ...file, status: 'synced', selected: false } : file
                    )
                );
            },
            onError: (path, error) => {
                setFiles((prev) =>
                    prev.map((file) =>
                        file.path === path ? { ...file, status: 'error', error, selected: true } : file
                    )
                );
            },
        });

        setIsSyncing(false);
        setSyncProgress(null);
        setSyncMode(null);

        await loadFolderStats(folder);

        if (successCount > 0) {
            const message =
                failCount > 0
                    ? `Synced ${successCount} files (${failCount} failed)`
                    : `Synced ${successCount} files`;
            toast({
                title: 'Sync Complete',
                description: message,
                status: failCount > 0 ? 'warning' : 'success',
            });
        } else if (failCount > 0) {
            toast({ title: 'Sync Failed', description: `Failed to sync ${failCount} files`, status: 'danger' });
        }
    }, [loadFolderStats, toast]);

    const syncSelectedFiles = async () => {
        if (!selectedFolder) {
            return;
        }

        const selectedFiles = files.filter(
            (file) => file.selected && (file.status === 'pending' || file.status === 'error' || file.status === 'retrying')
        );
        if (selectedFiles.length === 0) {
            toast({ title: 'Warning', description: 'No files selected for sync', status: 'warning' });
            return;
        }

        if (isCapacitor) {
            try {
                const hasNotificationPermission = await getBackgroundSyncNotificationPermissionStatus();
                const notificationsGranted = hasNotificationPermission
                    ? true
                    : await requestBackgroundSyncNotificationPermission();

                if (!notificationsGranted) {
                    toast({
                        title: 'Notifications required',
                        description: 'Allow notifications so Android can keep background sync visible and reliable.',
                        status: 'warning',
                    });
                    await runInlineSync(selectedFolder, selectedFiles);
                    return;
                }

                const session = await authFetchJson<CreateMobileSyncSessionResponse>('/api/mobile/sync-session', {
                    method: 'POST',
                });

                await startBackgroundSync({
                    serverUrl: window.location.origin,
                    authToken: session.syncToken,
                    folderId: selectedFolder.id,
                    files: selectedFiles.map((file) => ({
                        path: file.path,
                        name: file.name,
                        size: file.size,
                        mtime: file.mtime,
                        mimeType: file.mimeType,
                    })),
                });

                setFiles((prev) =>
                    prev.map((file) =>
                        selectedFiles.some((selectedFile) => selectedFile.path === file.path)
                            ? { ...file, status: 'queued', error: undefined }
                            : file
                    )
                );
                setIsSyncing(true);
                setSyncMode('background');
                setSyncProgress({ current: 0, total: selectedFiles.length, currentFileName: '', state: 'queued' });
                return;
            } catch (error) {
                console.error('Failed to start background sync:', error);
                toast({
                    title: 'Background sync unavailable',
                    description: 'Falling back to in-app sync for this run.',
                    status: 'warning',
                });
            }
        }

        await runInlineSync(selectedFolder, selectedFiles);
    };

    const cancelSync = async () => {
        if (!isCapacitor || !isSyncing) {
            return;
        }

        try {
            await cancelBackgroundSync();
            setIsSyncing(false);
            setSyncProgress(null);
            setSyncMode(null);
            setFiles((prev) =>
                prev.map((file) =>
                    file.status === 'queued' || file.status === 'retrying' || file.status === 'uploading' || file.status === 'finalizing'
                        ? { ...file, status: 'error', error: 'Background sync cancelled', selected: true }
                        : file
                )
            );
            toast({
                title: 'Background Sync Cancelled',
                description: 'Current uploads were stopped and remaining files were returned for retry.',
                status: 'warning',
            });
        } catch (error) {
            console.error('Error cancelling sync:', error);
            toast({ title: 'Error', description: 'Failed to cancel background sync', status: 'danger' });
        }
    };

    const handleClearSyncHistory = async () => {
        if (!selectedFolder) {
            return;
        }

        try {
            await clearFolderSyncHistory(selectedFolder.id);
            setSyncedCount(0);
            setLastSyncTime(null);
            await loadFiles();
            toast({ title: 'Cleared', description: 'Sync history cleared for this folder', status: 'success' });
        } catch (error) {
            console.error('Error clearing sync history:', error);
            toast({ title: 'Error', description: 'Failed to clear sync history', status: 'danger' });
        }
    };

    return {
        isCapacitor,
        selectedFolder,
        files,
        isLoading,
        isRefreshing,
        isSyncing,
        syncMode,
        syncProgress,
        syncedCount,
        lastSyncTime,
        ...listState,
        pickFolder,
        clearFolder,
        loadFiles,
        syncSelectedFiles,
        cancelSync,
        handleClearSyncHistory,
    };
}

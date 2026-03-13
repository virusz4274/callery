import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/toast-provider';
import { clearFolderSyncHistory } from '@/lib/sync-store';
import type { Folder } from '@/lib/capacitor';
import type { SyncProgress, SyncableFile } from './types';
import { syncAndroidFiles } from './sync-runner';
import { useSyncListState } from './use-sync-list-state';
import {
    clearSavedFolder,
    initAndroidSyncContext,
    loadFolderFiles,
    loadSyncStats,
    pickAndSaveFolder,
} from './sync-loader';

export function useAndroidSync() {
    const { toast } = useToast();

    const [isCapacitor, setIsCapacitor] = useState<boolean | null>(null);
    const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
    const [files, setFiles] = useState<SyncableFile[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
    const [syncedCount, setSyncedCount] = useState(0);
    const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);

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
            const syncableFiles = await loadFolderFiles(selectedFolder);
            setFiles(syncableFiles);
            await loadFolderStats(selectedFolder);
        } catch (error) {
            console.error('Error loading files:', error);
            toast({ title: 'Error', description: 'Failed to load files from folder', status: 'danger' });
        } finally {
            setIsLoading(false);
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
        } catch (error) {
            console.error('Error clearing folder:', error);
        }
    };

    const syncSelectedFiles = async () => {
        if (!selectedFolder) {
            return;
        }

        const selectedFiles = files.filter(
            (file) => file.selected && (file.status === 'pending' || file.status === 'error')
        );
        if (selectedFiles.length === 0) {
            toast({ title: 'Warning', description: 'No files selected for sync', status: 'warning' });
            return;
        }

        setIsSyncing(true);
        setSyncProgress({ current: 0, total: selectedFiles.length, currentFileName: '' });

        const { successCount, failCount } = await syncAndroidFiles({
            selectedFolder,
            selectedFiles,
            onProgress: (current, total, currentFileName) => {
                setSyncProgress({ current, total, currentFileName });
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

        await loadFolderStats(selectedFolder);

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
        isSyncing,
        syncProgress,
        syncedCount,
        lastSyncTime,
        ...listState,
        pickFolder,
        clearFolder,
        loadFiles,
        syncSelectedFiles,
        handleClearSyncHistory,
    };
}

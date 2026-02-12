import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/components/toast-provider';
import { uploadRecordings } from '@/app/actions/upload-recordings';
import {
    generateFingerprint,
    getSyncedFingerprints,
    markAsSynced,
    getSyncedCount,
    getLastSyncTime,
    clearFolderSyncHistory
} from '@/lib/sync-store';
import type { Folder } from '@/lib/capacitor';
import { SyncStatus, SyncableFile, SyncProgress, SortField, SortDirection } from './types';

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

    // Filter/Sort State
    const [activeTab, setActiveTab] = useState<'new' | 'synced'>('new');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortField, setSortField] = useState<SortField>('mtime');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    // Pagination State
    const [page, setPage] = useState(1);
    const rowsPerPage = 50;

    // Check if running in Capacitor and load saved folder
    useEffect(() => {
        async function init() {
            try {
                const { isCapacitorApp, loadSyncFolder } = await import('@/lib/capacitor');
                const isNative = isCapacitorApp();
                setIsCapacitor(isNative);

                if (isNative) {
                    // Try to load previously selected folder
                    const savedFolder = loadSyncFolder();
                    if (savedFolder) {
                        setSelectedFolder(savedFolder);
                    }
                }
            } catch {
                setIsCapacitor(false);
            }
        }
        init();
    }, []);

    // Load sync stats when folder changes
    const loadSyncStats = useCallback(async (folder: Folder) => {
        try {
            const count = await getSyncedCount(folder.id);
            const lastSync = await getLastSyncTime(folder.id);
            setSyncedCount(count);
            setLastSyncTime(lastSync);
        } catch (error) {
            console.error('Error loading sync stats:', error);
        }
    }, []);

    useEffect(() => {
        if (selectedFolder) {
            loadSyncStats(selectedFolder);
        }
    }, [selectedFolder, loadSyncStats]);

    async function loadFiles() {
        if (!selectedFolder) return;

        setIsLoading(true);
        try {
            const { listAudioFiles } = await import('@/lib/capacitor');
            const audioFiles = await listAudioFiles(selectedFolder);

            // Generate fingerprints and check sync status locally
            const fingerprints = audioFiles.map(f =>
                generateFingerprint(selectedFolder.id, f.path, f.size, f.mtime)
            );
            const syncedSet = await getSyncedFingerprints(fingerprints);

            setFiles(audioFiles.map((f, index) => {
                const fingerprint = fingerprints[index];
                const isSyncedFile = syncedSet.has(fingerprint);
                return {
                    ...f,
                    fingerprint,
                    selected: !isSyncedFile, // Select by default if not synced
                    status: isSyncedFile ? 'synced' as SyncStatus : 'pending' as SyncStatus,
                };
            }));

            // Reload sync stats
            await loadSyncStats(selectedFolder);
        } catch (error) {
            console.error('Error loading files:', error);
            toast({ title: 'Error', description: 'Failed to load files from folder', status: 'danger' });
        } finally {
            setIsLoading(false);
        }
    }

    // Load files when folder is selected
    useEffect(() => {
        if (selectedFolder && isCapacitor) {
            loadFiles();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFolder, isCapacitor]);

    const filteredFiles = useMemo(() => {
        let filtered = files.filter(f => {
            // Tab filter
            if (activeTab === 'new' && f.status === 'synced') return false;
            // SHOW synced items in Synced tab OR items that just became synced during this session
            if (activeTab === 'synced' && f.status !== 'synced') return false;

            // Search filter
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                return f.name.toLowerCase().includes(query);
            }
            return true;
        });

        // Sorting
        filtered.sort((a, b) => {
            let comparison = 0;
            if (sortField === 'name') {
                comparison = a.name.localeCompare(b.name);
            } else if (sortField === 'size') {
                comparison = a.size - b.size;
            } else if (sortField === 'mtime') {
                comparison = a.mtime - b.mtime;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });

        return filtered;
    }, [files, activeTab, searchQuery, sortField, sortDirection]);

    // Reset page when filters change
    useEffect(() => {
        setPage(1);
    }, [activeTab, searchQuery, sortField, sortDirection]);

    const paginatedFiles = useMemo(() => {
        const start = (page - 1) * rowsPerPage;
        return filteredFiles.slice(start, start + rowsPerPage);
    }, [filteredFiles, page, rowsPerPage]);

    const totalPages = Math.ceil(filteredFiles.length / rowsPerPage);

    const pendingFiles = files.filter(f => f.status === 'pending');
    // Calculate selection state for master checkbox
    // If filtering is active (searchQuery), consider only filtered pending files
    // Otherwise consider all pending files
    const relevantFiles = searchQuery ? filteredFiles.filter(f => f.status === 'pending') : pendingFiles;
    const selectedRelevantCount = relevantFiles.filter(f => f.selected).length;
    const totalRelevantCount = relevantFiles.length;

    const isAllSelected = totalRelevantCount > 0 && selectedRelevantCount === totalRelevantCount;
    const isIndeterminate = selectedRelevantCount > 0 && selectedRelevantCount < totalRelevantCount;

    const toggleSelectAll = () => {
        if (isAllSelected) {
            // Deselect relevant files
            const relevantFingerprints = new Set(relevantFiles.map(f => f.fingerprint));
            setFiles(prev => prev.map(f =>
                relevantFingerprints.has(f.fingerprint) ? { ...f, selected: false } : f
            ));
        } else {
            // Select all relevant files
            const relevantFingerprints = new Set(relevantFiles.map(f => f.fingerprint));
            setFiles(prev => prev.map(f =>
                relevantFingerprints.has(f.fingerprint) ? { ...f, selected: true } : f
            ));
        }
    };
    // Calculate total pending size
    const pendingSize = pendingFiles.reduce((acc, f) => acc + f.size, 0);

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc'); // Default to desc for new field
        }
    };

    async function pickFolder() {
        try {
            const { pickSyncFolder, saveSyncFolder } = await import('@/lib/capacitor');
            const folder = await pickSyncFolder();
            if (folder) {
                setSelectedFolder(folder);
                saveSyncFolder(folder);
            }
        } catch (error) {
            console.error('Error picking folder:', error);
            toast({ title: 'Error', description: 'Failed to select folder', status: 'danger' });
        }
    }

    async function clearFolder() {
        try {
            const { clearSyncFolder } = await import('@/lib/capacitor');
            clearSyncFolder();
            setSelectedFolder(null);
            setFiles([]);
        } catch (error) {
            console.error('Error clearing folder:', error);
        }
    }

    function toggleFileSelection(fingerprint: string) {
        setFiles(prev => prev.map(f =>
            f.fingerprint === fingerprint ? { ...f, selected: !f.selected } : f
        ));
    }

    function selectAllVisible() {
        // Select all currently filtered/visible pending files
        const visibleFingerprints = new Set(paginatedFiles.filter(f => f.status === 'pending').map(f => f.fingerprint));
        setFiles(prev => prev.map(f =>
            visibleFingerprints.has(f.fingerprint) ? { ...f, selected: true } : f
        ));
    }

    function selectAllPending() {
        setFiles(prev => prev.map(f =>
            f.status === 'pending' ? { ...f, selected: true } : f
        ));
    }

    function deselectAll() {
        setFiles(prev => prev.map(f => ({ ...f, selected: false })));
    }

    async function syncSelectedFiles() {
        if (!selectedFolder) return;

        const selectedFiles = files.filter(f => f.selected && f.status === 'pending');
        if (selectedFiles.length === 0) {
            toast({ title: 'Warning', description: 'No files selected for sync', status: 'warning' });
            return;
        }

        setIsSyncing(true);
        setSyncProgress({ current: 0, total: selectedFiles.length, currentFileName: '' });

        const { readFileAsBlob } = await import('@/lib/capacitor');
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];

            // Update progress
            setSyncProgress({ current: i + 1, total: selectedFiles.length, currentFileName: file.name });

            // Update status to uploading
            setFiles(prev => prev.map(f =>
                f.path === file.path ? { ...f, status: 'uploading' } : f
            ));

            try {
                // Read file as blob using SAF
                const blob = await readFileAsBlob(selectedFolder, file.path);
                const fileObj = new File([blob], file.name, { type: file.mimeType });

                // Create FormData and upload
                const formData = new FormData();
                formData.append('files', fileObj);

                const result = await uploadRecordings(formData);

                if (result.success) {
                    successCount++;

                    // Mark as synced in local store (use file fingerprint as ID since action doesn't return recording ID)
                    await markAsSynced(
                        selectedFolder.id,
                        file.path,
                        file.name,
                        file.size,
                        file.mtime,
                        file.fingerprint // Use fingerprint as recording reference
                    );

                    setFiles(prev => prev.map(f =>
                        f.path === file.path ? { ...f, status: 'synced', selected: false } : f
                    ));
                } else {
                    failCount++;
                    setFiles(prev => prev.map(f =>
                        f.path === file.path ? { ...f, status: 'error', error: result.error } : f
                    ));
                }
            } catch (error) {
                failCount++;
                setFiles(prev => prev.map(f =>
                    f.path === file.path ? {
                        ...f,
                        status: 'error',
                        error: error instanceof Error ? error.message : 'Upload failed'
                    } : f
                ));
            }
        }

        setIsSyncing(false);
        setSyncProgress(null);

        // Reload sync stats
        await loadSyncStats(selectedFolder);

        if (successCount > 0) {
            const message = failCount > 0
                ? `Synced ${successCount} files (${failCount} failed)`
                : `Synced ${successCount} files`;
            toast({ title: 'Sync Complete', description: message, status: failCount > 0 ? 'warning' : 'success' });
        } else if (failCount > 0) {
            toast({ title: 'Sync Failed', description: `Failed to sync ${failCount} files`, status: 'danger' });
        }
    }

    async function handleClearSyncHistory() {
        if (!selectedFolder) return;

        try {
            await clearFolderSyncHistory(selectedFolder.id);
            setSyncedCount(0);
            setLastSyncTime(null);
            // Reload files to reset their status
            await loadFiles();
            toast({ title: 'Cleared', description: 'Sync history cleared for this folder', status: 'success' });
        } catch (error) {
            console.error('Error clearing sync history:', error);
            toast({ title: 'Error', description: 'Failed to clear sync history', status: 'danger' });
        }
    }

    return {
        isCapacitor,
        selectedFolder,
        files,
        isLoading,
        isSyncing,
        syncProgress,
        syncedCount,
        lastSyncTime,
        activeTab,
        setActiveTab,
        searchQuery,
        setSearchQuery,
        sortField,
        sortDirection,
        // Derived state
        filteredFiles,
        paginatedFiles,
        page,
        setPage,
        totalPages,
        pendingFiles,
        relevantFiles,
        selectedRelevantCount,
        totalRelevantCount,
        isAllSelected,
        isIndeterminate,
        pendingSize,
        // Actions
        toggleSelectAll,
        toggleSort,
        pickFolder,
        clearFolder,
        loadFiles,
        toggleFileSelection,
        selectAllVisible,
        selectAllPending,
        deselectAll,
        syncSelectedFiles,
        handleClearSyncHistory
    };
}

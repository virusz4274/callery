'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Button, Spinner, Checkbox, Label, Input, Chip } from '@heroui/react';
import {
    FolderOpen,
    RefreshCw,
    Upload,
    Check,
    X,
    AlertCircle,
    Smartphone,
    FolderSync,
    Trash2,
    Clock,
    Search,
    SortAsc,
    SortDesc,
    Filter
} from 'lucide-react';
import { useToast } from '@/components/toast-provider';
import { useUser } from '@/lib/firebase/provider';
import { uploadRecordings } from '@/app/actions/upload-recordings';
import {
    generateFingerprint,
    getSyncedFingerprints,
    markAsSynced,
    getSyncedCount,
    getLastSyncTime,
    clearFolderSyncHistory
} from '@/lib/sync-store';
import { CustomPagination } from '@/components/recordings/pagination';

// Types for Capacitor utilities (loaded dynamically)
import type { Folder, AudioFileInfo } from '@/lib/capacitor';

type SyncStatus = 'pending' | 'synced' | 'uploading' | 'error';

interface SyncableFile extends AudioFileInfo {
    fingerprint: string;
    selected: boolean;
    status: SyncStatus;
    error?: string;
}

interface SyncProgress {
    current: number;
    total: number;
    currentFileName: string;
}

type SortField = 'mtime' | 'size' | 'name';
type SortDirection = 'asc' | 'desc';

export function AndroidSyncPage() {
    const { user } = useUser();
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

    function formatRelativeTime(timestamp: number): string {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return new Date(timestamp).toLocaleDateString();
    }

    function formatFileSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function formatDate(timestamp: number): string {
        return new Date(timestamp).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // Loading state
    if (isCapacitor === null) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Spinner size="lg" />
            </div>
        );
    }

    // Not running in Capacitor
    if (!isCapacitor) {
        return (
            <div className="container mx-auto px-4 py-8 max-w-2xl">
                <Card className="p-8 text-center">
                    <Smartphone className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                    <h1 className="text-2xl font-bold mb-2">Android App Only</h1>
                    <p className="text-muted-foreground mb-4">
                        This feature is only available in the VoSift Android app.
                        It allows you to sync call recordings directly from your device folders.
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Download the Android app to use this feature.
                    </p>
                </Card>
            </div>
        );
    }

    const unselectedPendingCount = files.filter(f => f.status === 'pending' && !f.selected).length;
    const selectedCount = files.filter(f => f.selected && f.status === 'pending').length;
    const syncedTotal = files.filter(f => f.status === 'synced').length;

    return (
        <div className="flex flex-col h-full gap-4">
            <div className="flex items-center gap-3 mb-4 shrink-0">
                <FolderSync className="h-8 w-8 text-primary" />
                <div>
                    <h1 className="text-2xl font-bold">Folder Sync</h1>
                    <p className="text-muted-foreground text-sm">
                        Sync recordings from your device folders
                    </p>
                </div>

                {/* Global Stats/Status */}
                <div className="ml-auto flex items-center gap-2">
                    {lastSyncTime && (
                        <span className="text-xs text-muted-foreground hidden sm:inline-block">
                            Last synced {formatRelativeTime(lastSyncTime)}
                        </span>
                    )}
                </div>
            </div>

            {/* Folder Selection & Stats Card */}
            <Card className="p-4 mb-4 shrink-0">
                {!selectedFolder ? (
                    <div className="text-center py-6">
                        <FolderOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                        <p className="text-muted-foreground mb-4">
                            Choose a folder containing your call recordings
                        </p>
                        <Button onPress={pickFolder} size="lg" variant="primary">
                            <FolderOpen className="h-5 w-5 mr-2" />
                            Choose Folder
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                        <div className="flex-1">
                            <h3 className="text-sm font-medium text-muted-foreground mb-1">Selected Folder</h3>
                            <div className="flex items-center gap-2">
                                <FolderOpen className="h-5 w-5 text-primary" />
                                <span className="font-semibold text-lg">{selectedFolder.name}</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    isIconOnly
                                    onPress={clearFolder}
                                    className="text-danger"
                                    aria-label="Change folder"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="flex gap-4 mt-2 text-sm">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full bg-warning"></div>
                                    <span>{pendingFiles.length} Pending ({formatFileSize(pendingSize)})</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full bg-success"></div>
                                    <span>{syncedTotal} Synced</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2 w-full sm:w-auto">
                            <Button
                                variant="ghost"
                                onPress={loadFiles}
                                isIconOnly={isLoading}
                                isDisabled={isLoading}
                            >
                                {!isLoading && <RefreshCw className="h-4 w-4 mr-2" />}
                                {isLoading ? <Spinner size="sm" /> : 'Refresh'}
                            </Button>

                            {selectedCount > 0 && (
                                <Button
                                    variant="primary"
                                    onPress={syncSelectedFiles}
                                    isIconOnly={isSyncing}
                                    isDisabled={isSyncing}
                                >
                                    {!isSyncing && <Upload className="h-4 w-4 mr-2" />}
                                    {isSyncing ? <Spinner size="sm" color="current" /> : `Sync ${selectedCount} Files`}
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </Card>

            {/* Main Content Area */}
            {selectedFolder && (
                <div className="flex-1 min-h-0 flex flex-col bg-content1 rounded-large shadow-small border border-default-200 overflow-hidden">
                    {/* Custom Tabs */}
                    <div className="flex border-b border-default-200 bg-content1 px-4 pt-2 gap-4">
                        <button
                            onClick={() => setActiveTab('new')}
                            className={`pb-2 px-2 text-sm font-medium border-b-2 transition-colors focus:outline-none ${activeTab === 'new'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-foreground/60 hover:text-foreground'
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <span>New & Pending</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === 'new'
                                    ? 'bg-warning/20 text-warning-600'
                                    : 'bg-default-100 text-default-500'
                                    }`}>{pendingFiles.length}</span>
                            </div>
                        </button>
                        <button
                            onClick={() => setActiveTab('synced')}
                            className={`pb-2 px-2 text-sm font-medium border-b-2 transition-colors focus:outline-none ${activeTab === 'synced'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-foreground/60 hover:text-foreground'
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <span>Synced History</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === 'synced'
                                    ? 'bg-success/20 text-success-600'
                                    : 'bg-default-100 text-default-500'
                                    }`}>{syncedTotal}</span>
                            </div>
                        </button>
                    </div>

                    {/* Toolbar */}
                    <div className="p-3 border-b border-default-100 flex flex-wrap gap-3 items-center justify-between bg-content1">
                        <div className="relative w-full sm:w-64">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
                                <Search className="h-4 w-4 text-default-400" />
                            </div>
                            <Input
                                placeholder="Search files..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 pr-8"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 text-default-400 hover:text-default-600 focus:outline-none"
                                    aria-label="Clear search"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-2 ml-auto">
                            {/* Master Checkbox for New Tab */}
                            {activeTab === 'new' && (
                                <div className="flex items-center gap-2 mr-2">
                                    <Checkbox
                                        isSelected={isAllSelected}
                                        isIndeterminate={isIndeterminate}
                                        onChange={toggleSelectAll}
                                        isDisabled={totalRelevantCount === 0}
                                    >
                                        Select All
                                    </Checkbox>
                                </div>
                            )}

                            {activeTab === 'synced' && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-danger"
                                    onPress={handleClearSyncHistory}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Clear History
                                </Button>
                            )}

                            <div className="h-4 w-px bg-default-300 mx-1"></div>

                            {/* Sort Controls */}
                            <Button
                                size="sm"
                                variant={sortField === 'mtime' ? 'primary' : 'ghost'}
                                onPress={() => toggleSort('mtime')}
                            >
                                Date
                                {sortField === 'mtime' && (sortDirection === 'asc' ? <SortAsc className="h-3 w-3 ml-2" /> : <SortDesc className="h-3 w-3 ml-2" />)}
                            </Button>
                            <Button
                                size="sm"
                                variant={sortField === 'size' ? 'primary' : 'ghost'}
                                onPress={() => toggleSort('size')}
                            >
                                Size
                                {sortField === 'size' && (sortDirection === 'asc' ? <SortAsc className="h-3 w-3 ml-2" /> : <SortDesc className="h-3 w-3 ml-2" />)}
                            </Button>
                        </div>
                    </div>

                    {/* File List */}
                    <div className="flex-1 min-h-0 overflow-y-auto p-2">
                        {isLoading ? (
                            <div className="flex justify-center items-center h-full">
                                <Spinner />
                            </div>
                        ) : filteredFiles.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                                <Search className="h-10 w-10 mb-2 opacity-20" />
                                <p>No files found</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {paginatedFiles.map((file, index) => (
                                    <div
                                        key={file.fingerprint}
                                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${file.selected
                                            ? 'bg-primary/10 border-primary/30'
                                            : 'bg-content1 hover:bg-content2 border-default-100'
                                            }`}
                                    >
                                        <div className="flex items-center justify-center shrink-0">
                                            {file.status === 'synced' ? (
                                                <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center text-success">
                                                    <Check className="h-5 w-5" />
                                                </div>
                                            ) : file.status === 'uploading' ? (
                                                <Spinner size="sm" />
                                            ) : (
                                                <Checkbox
                                                    isSelected={file.selected}
                                                    onChange={isSelected => toggleFileSelection(file.fingerprint)}
                                                    isDisabled={file.status !== 'pending'}
                                                />
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0 pointer-events-none">
                                            <p className="font-medium truncate text-foreground">{file.name}</p>
                                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                                <span>{formatFileSize(file.size)}</span>
                                                <span>•</span>
                                                <span className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    {formatDate(file.mtime)}
                                                </span>
                                                {file.status === 'synced' && (
                                                    <span className="text-success ml-2 font-medium">Synced</span>
                                                )}
                                            </div>
                                            {file.error && (
                                                <p className="text-xs text-danger mt-1">{file.error}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Pagination */}
                    <div className="p-3 border-t border-default-100 bg-content1 flex justify-between items-center shrink-0">
                        <div className="text-sm text-muted-foreground">
                            Showing {Math.min(filteredFiles.length, (page - 1) * rowsPerPage + 1)} - {Math.min(filteredFiles.length, page * rowsPerPage)} of {filteredFiles.length}
                        </div>
                        <CustomPagination
                            page={page}
                            total={totalPages}
                            onChange={setPage}
                        />
                    </div>

                    {/* Sync Progress Overlay */}
                    {syncProgress && (
                        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-8">
                            <Card className="w-full max-w-md p-6 shadow-xl">
                                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                    <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                                    Syncing Files...
                                </h3>

                                <div className="space-y-4">
                                    <div className="flex justify-between text-sm">
                                        <span>Progress</span>
                                        <span className="font-mono">{syncProgress.current} / {syncProgress.total}</span>
                                    </div>
                                    <div className="h-2 bg-default-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary transition-all duration-300"
                                            style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate font-mono bg-default-50 p-2 rounded">
                                        {syncProgress.currentFileName}
                                    </p>
                                </div>
                            </Card>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

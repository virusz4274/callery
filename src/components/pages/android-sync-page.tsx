'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Card, Chip, Spinner, Surface } from '@heroui/react';
import { ArrowRight, CheckCircle2, Clock3, FolderSync, Smartphone, Upload } from 'lucide-react';

import { useAndroidSync } from './android-sync/use-android-sync';
import { SyncHeader } from './android-sync/SyncHeader';
import { FolderSelectionCard } from './android-sync/FolderSelectionCard';
import { FileList } from './android-sync/FileList';

export function AndroidSyncPage() {
    const {
        isCapacitor,
        selectedFolder,
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
        toggleSort,
        // Derived state
        filteredFiles,
        paginatedFiles,
        page,
        setPage,
        totalPages,
        pendingFiles,
        selectedRelevantCount,
        totalRelevantCount,
        isAllSelected,
        isIndeterminate,
        pendingSize,
        // Actions
        toggleSelectAll,
        pickFolder,
        clearFolder,
        loadFiles,
        toggleFileSelection,
        syncSelectedFiles,
        handleClearSyncHistory
    } = useAndroidSync();

    // Loading state
    if (isCapacitor === null) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Spinner size="lg" />
            </div>
        );
    }

    // Not running in Capacitor
    if (!isCapacitor) {
        return (
            <div className="relative mx-auto max-w-5xl space-y-8">
                <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(circle_at_top_left,rgba(38,132,255,0.12),transparent_34%),radial-gradient(circle_at_top_right,rgba(13,148,136,0.10),transparent_28%)]" />

                <Card className="rounded-[1.9rem] border border-default-200/80 bg-background/95 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
                    <Card.Content className="space-y-6 p-6 md:p-8">
                        <div className="flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-accent/10 text-accent">
                            <Smartphone className="h-8 w-8" />
                        </div>
                        <div className="space-y-3">
                            <Chip variant="soft" color="accent" className="rounded-full px-3 py-1 text-xs font-medium">
                                Android only
                            </Chip>
                            <h1 className="text-4xl font-black tracking-[-0.05em] text-foreground md:text-5xl">
                                Folder sync runs inside the Android app.
                            </h1>
                            <p className="max-w-2xl text-base leading-7 text-default-600 md:text-lg">
                                This workflow reads recordings directly from device folders, so it only works where the mobile file APIs are available.
                            </p>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                            <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                                <div className="font-semibold text-foreground">What this does</div>
                                <p className="mt-2 text-sm leading-6 text-default-500">
                                    Browse a folder on your phone, scan nested recording folders, and sync selected files into the workspace.
                                </p>
                            </Surface>
                            <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                                <div className="font-semibold text-foreground">On the web instead?</div>
                                <p className="mt-2 text-sm leading-6 text-default-500">
                                    Use the regular upload flow to bring files in manually from desktop or browser storage.
                                </p>
                            </Surface>
                        </div>

                        <Link href="/upload">
                            <Button className="rounded-full px-5 font-semibold">
                                Go to upload
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                    </Card.Content>
                </Card>
            </div>
        );
    }

    return (
        <div className="relative mx-auto flex h-full max-w-7xl flex-col gap-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(circle_at_top_right,rgba(38,132,255,0.14),transparent_34%),radial-gradient(circle_at_top_left,rgba(13,148,136,0.12),transparent_28%)]" />

            <SyncHeader lastSyncTime={lastSyncTime} />

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                            <Clock3 className="h-3.5 w-3.5" />
                            Pending
                        </div>
                        <div className="text-2xl font-bold text-foreground">{pendingFiles.length}</div>
                        <div className="text-sm text-default-500">Files not yet synced from the selected folder</div>
                    </div>
                </Surface>
                <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                            <Upload className="h-3.5 w-3.5" />
                            Selected
                        </div>
                        <div className="text-2xl font-bold text-foreground">{selectedRelevantCount}</div>
                        <div className="text-sm text-default-500">Files staged for the next sync run</div>
                    </div>
                </Surface>
                <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Synced
                        </div>
                        <div className="text-2xl font-bold text-foreground">{syncedCount}</div>
                        <div className="text-sm text-default-500">Files already copied into the workspace</div>
                    </div>
                </Surface>
                <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                            <FolderSync className="h-3.5 w-3.5" />
                            Active folder
                        </div>
                        <div className="text-2xl font-bold text-foreground">{selectedFolder ? 'Connected' : 'Waiting'}</div>
                        <div className="text-sm text-default-500">Folder access is {selectedFolder ? selectedFolder.name : 'not set yet'}</div>
                    </div>
                </Surface>
            </div>

            <FolderSelectionCard
                selectedFolder={selectedFolder}
                pendingFilesCount={pendingFiles.length}
                pendingSize={pendingSize}
                syncedTotal={syncedCount}
                isLoading={isLoading}
                isSyncing={isSyncing}
                selectedCount={selectedRelevantCount}
                onPickFolder={pickFolder}
                onClearFolder={clearFolder}
                onLoadFiles={loadFiles}
                onSync={syncSelectedFiles}
            />

            {selectedFolder && (
                <FileList
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    pendingCount={pendingFiles.length}
                    syncedCount={syncedCount}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSortChange={toggleSort}
                    isAllSelected={isAllSelected}
                    isIndeterminate={isIndeterminate}
                    onToggleSelectAll={toggleSelectAll}
                    totalRelevantCount={totalRelevantCount}
                    onClearHistory={handleClearSyncHistory}
                    isLoading={isLoading}
                    filteredFiles={filteredFiles}
                    paginatedFiles={paginatedFiles}
                    page={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    onToggleFileSelection={toggleFileSelection}
                    syncProgress={syncProgress}
                />
            )}
        </div>
    );
}

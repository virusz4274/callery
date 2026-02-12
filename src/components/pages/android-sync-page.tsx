'use client';

import React from 'react';
import { Card, Spinner } from '@heroui/react';
import { Smartphone } from 'lucide-react';

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
                    <h1 className="text-2xl font-bold">Android App Only</h1>
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

    return (
        <div className="flex flex-col h-full gap-4">
            <SyncHeader lastSyncTime={lastSyncTime} />

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

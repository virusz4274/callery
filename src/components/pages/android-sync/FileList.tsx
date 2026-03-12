import type { SyncProgress, SyncableFile, SortDirection, SortField } from './types';
import { SyncProgressOverlay } from './SyncProgressOverlay';
import { FileListContent } from './file-list/file-list-content';
import { FileListFooter } from './file-list/file-list-footer';
import { FileListTabs } from './file-list/file-list-tabs';
import { FileListToolbar } from './file-list/file-list-toolbar';

interface FileListProps {
    activeTab: 'new' | 'synced';
    onTabChange: (tab: 'new' | 'synced') => void;
    pendingCount: number;
    syncedCount: number;
    searchQuery: string;
    onSearchChange: (q: string) => void;
    sortField: SortField;
    sortDirection: SortDirection;
    onSortChange: (field: SortField) => void;
    isAllSelected: boolean;
    isIndeterminate: boolean;
    onToggleSelectAll: () => void;
    totalRelevantCount: number;
    onClearHistory: () => void;
    isLoading: boolean;
    filteredFiles: SyncableFile[];
    paginatedFiles: SyncableFile[];
    page: number;
    totalPages: number;
    onPageChange: (p: number) => void;
    onToggleFileSelection: (fingerprint: string) => void;
    syncProgress: SyncProgress | null;
}

export function FileList({
    activeTab,
    onTabChange,
    pendingCount,
    syncedCount,
    searchQuery,
    onSearchChange,
    sortField,
    sortDirection,
    onSortChange,
    isAllSelected,
    isIndeterminate,
    onToggleSelectAll,
    totalRelevantCount,
    onClearHistory,
    isLoading,
    filteredFiles,
    paginatedFiles,
    page,
    totalPages,
    onPageChange,
    onToggleFileSelection,
    syncProgress,
}: FileListProps) {
    return (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.9rem] border border-default-200/80 bg-background/95 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
            <FileListTabs
                activeTab={activeTab}
                pendingCount={pendingCount}
                syncedCount={syncedCount}
                onTabChange={onTabChange}
            />

            <FileListToolbar
                activeTab={activeTab}
                searchQuery={searchQuery}
                onSearchChange={onSearchChange}
                sortField={sortField}
                sortDirection={sortDirection}
                onSortChange={onSortChange}
                isAllSelected={isAllSelected}
                isIndeterminate={isIndeterminate}
                onToggleSelectAll={onToggleSelectAll}
                totalRelevantCount={totalRelevantCount}
                onClearHistory={onClearHistory}
            />

            <FileListContent
                isLoading={isLoading}
                filteredFiles={filteredFiles}
                paginatedFiles={paginatedFiles}
                onToggleFileSelection={onToggleFileSelection}
            />

            <FileListFooter
                filteredCount={filteredFiles.length}
                page={page}
                totalPages={totalPages}
                onPageChange={onPageChange}
            />

            {syncProgress && <SyncProgressOverlay progress={syncProgress} />}
        </div>
    );
}

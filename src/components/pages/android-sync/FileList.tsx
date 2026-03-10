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
        <div className="flex-1 min-h-0 flex flex-col bg-content1 rounded-large shadow-small border border-default-200 overflow-hidden relative">
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

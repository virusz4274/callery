import { Input, Button, Checkbox, Spinner } from '@heroui/react';
import { Trash2, Search, X, SortAsc, SortDesc } from 'lucide-react';
import { CustomPagination } from '@/components/recordings/pagination';
import { SyncableFile, SortField, SortDirection, SyncProgress } from './types';
import { FileItem } from './FileItem';
import { SyncProgressOverlay } from './SyncProgressOverlay';

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
    syncProgress
}: FileListProps) {
    return (
        <div className="flex-1 min-h-0 flex flex-col bg-content1 rounded-large shadow-small border border-default-200 overflow-hidden relative">
            {/* Custom Tabs */}
            <div className="flex border-b border-default-200 bg-content1 px-4 pt-2 gap-4">
                <button
                    onClick={() => onTabChange('new')}
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
                            }`}>{pendingCount}</span>
                    </div>
                </button>
                <button
                    onClick={() => onTabChange('synced')}
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
                            }`}>{syncedCount}</span>
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
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-9 pr-8"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => onSearchChange('')}
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
                                onChange={onToggleSelectAll}
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
                            onPress={onClearHistory}
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
                        onPress={() => onSortChange('mtime')}
                    >
                        Date
                        {sortField === 'mtime' && (sortDirection === 'asc' ? <SortAsc className="h-3 w-3 ml-2" /> : <SortDesc className="h-3 w-3 ml-2" />)}
                    </Button>
                    <Button
                        size="sm"
                        variant={sortField === 'size' ? 'primary' : 'ghost'}
                        onPress={() => onSortChange('size')}
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
                        {paginatedFiles.map((file) => (
                            <FileItem
                                key={file.fingerprint}
                                file={file}
                                onToggle={onToggleFileSelection}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Pagination */}
            <div className="p-3 border-t border-default-100 bg-content1 flex justify-between items-center shrink-0">
                <div className="text-sm text-muted-foreground">
                    Showing {Math.min(filteredFiles.length, (page - 1) * 50 + 1)} - {Math.min(filteredFiles.length, page * 50)} of {filteredFiles.length}
                </div>
                <CustomPagination
                    page={page}
                    total={totalPages}
                    onChange={onPageChange}
                />
            </div>

            {syncProgress && <SyncProgressOverlay progress={syncProgress} />}
        </div>
    );
}

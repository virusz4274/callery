import React from 'react';
import { Button, Checkbox, Input } from '@heroui/react';
import { Search, SortAsc, SortDesc, Trash2, X } from 'lucide-react';
import type { SortDirection, SortField } from '../types';

type FileListToolbarProps = {
    activeTab: 'new' | 'synced';
    searchQuery: string;
    onSearchChange: (query: string) => void;
    sortField: SortField;
    sortDirection: SortDirection;
    onSortChange: (field: SortField) => void;
    isAllSelected: boolean;
    isIndeterminate: boolean;
    onToggleSelectAll: () => void;
    totalRelevantCount: number;
    onClearHistory: () => void;
};

export function FileListToolbar({
    activeTab,
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
}: FileListToolbarProps) {
    return (
        <div className="p-3 border-b border-default-100 flex flex-wrap gap-3 items-center justify-between bg-content1">
            <div className="relative w-full sm:w-64">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
                    <Search className="h-4 w-4 text-default-400" />
                </div>
                <Input
                    placeholder="Search files..."
                    value={searchQuery}
                    onChange={(event) => onSearchChange(event.target.value)}
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
                    <Button size="sm" variant="ghost" className="text-danger" onPress={onClearHistory}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Clear History
                    </Button>
                )}

                <div className="h-4 w-px bg-default-300 mx-1"></div>

                <Button size="sm" variant={sortField === 'mtime' ? 'primary' : 'ghost'} onPress={() => onSortChange('mtime')}>
                    Date
                    {sortField === 'mtime' &&
                        (sortDirection === 'asc' ? (
                            <SortAsc className="h-3 w-3 ml-2" />
                        ) : (
                            <SortDesc className="h-3 w-3 ml-2" />
                        ))}
                </Button>
                <Button size="sm" variant={sortField === 'size' ? 'primary' : 'ghost'} onPress={() => onSortChange('size')}>
                    Size
                    {sortField === 'size' &&
                        (sortDirection === 'asc' ? (
                            <SortAsc className="h-3 w-3 ml-2" />
                        ) : (
                            <SortDesc className="h-3 w-3 ml-2" />
                        ))}
                </Button>
            </div>
        </div>
    );
}

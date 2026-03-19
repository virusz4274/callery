import React from 'react';
import { Button, Checkbox, Input, Surface } from '@heroui/react';
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
        <div className="min-w-0 border-b border-default-100/70 bg-background/90 p-4">
            <Surface variant="secondary" className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-default-200/80 p-3">
                <div className="relative min-w-0 flex-1 basis-full sm:max-w-72">
                    <div className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2">
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
                            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-default-400 hover:text-default-600 focus:outline-none"
                            aria-label="Clear search"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                <div className="flex min-w-0 w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                    {activeTab === 'new' && (
                        <div className="mr-2 flex min-w-0 items-center gap-2">
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
                            <Trash2 className="mr-2 h-4 w-4" />
                            Clear History
                        </Button>
                    )}

                    <div className="mx-1 hidden h-4 w-px bg-default-300 sm:block"></div>

                    <Button size="sm" variant={sortField === 'mtime' ? 'primary' : 'ghost'} onPress={() => onSortChange('mtime')}>
                        Date
                        {sortField === 'mtime' &&
                            (sortDirection === 'asc' ? (
                                <SortAsc className="ml-2 h-3 w-3" />
                            ) : (
                                <SortDesc className="ml-2 h-3 w-3" />
                            ))}
                    </Button>
                    <Button size="sm" variant={sortField === 'name' ? 'primary' : 'ghost'} onPress={() => onSortChange('name')}>
                        Name
                        {sortField === 'name' &&
                            (sortDirection === 'asc' ? (
                                <SortAsc className="ml-2 h-3 w-3" />
                            ) : (
                                <SortDesc className="ml-2 h-3 w-3" />
                            ))}
                    </Button>
                    <Button size="sm" variant={sortField === 'size' ? 'primary' : 'ghost'} onPress={() => onSortChange('size')}>
                        Size
                        {sortField === 'size' &&
                            (sortDirection === 'asc' ? (
                                <SortAsc className="ml-2 h-3 w-3" />
                            ) : (
                                <SortDesc className="ml-2 h-3 w-3" />
                            ))}
                    </Button>
                </div>
            </Surface>
        </div>
    );
}


"use client"

import React from 'react';
import { SearchField, Button, Chip, Select, ListBox, Input } from '@heroui/react';
import { Search, Sparkles, Filter, Calendar as CalendarIcon } from 'lucide-react';

interface SortConfig {
    by: 'date' | 'duration';
    order: 'asc' | 'desc';
}

interface DateRange {
    start?: string;
    end?: string;
}

interface DashboardToolbarProps {
    semanticQuery: string;
    onSemanticQueryChange: (value: string) => void;
    onSemanticSearch: () => void;
    onClearSemanticSearch: () => void;
    isSearching: boolean;
    semanticResultsCount?: number;
    currentSort: SortConfig;
    onSortChange: (config: SortConfig) => void;
    currentDateFilter: DateRange;
    onDateFilterChange: (range: DateRange) => void;
}

export function DashboardToolbar({
    semanticQuery,
    onSemanticQueryChange,
    onSemanticSearch,
    onClearSemanticSearch,
    isSearching,
    semanticResultsCount,
    currentSort,
    onSortChange,
    currentDateFilter,
    onDateFilterChange
}: DashboardToolbarProps) {
    return (
        <div className="flex flex-col gap-4">
            {/* Search Bar Section */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <Search className="h-4 w-4 text-primary" />
                        Semantic Search
                    </h3>
                    {semanticResultsCount !== undefined && (
                        <div className="flex items-center gap-2 px-1">
                            <span className="text-xs text-default-500 hidden sm:inline-block">
                                Found {semanticResultsCount} relevant recordings
                            </span>
                            <Chip color="success" variant="soft" size="sm" className="pl-2">
                                Active
                            </Chip>
                            <Button
                                size="sm"
                                variant="danger"
                                className="h-6 min-w-0"
                                onPress={onClearSemanticSearch}
                            >
                                Clear
                            </Button>
                        </div>
                    )}
                </div>

                <div className="w-full flex gap-2 items-center">
                    <SearchField
                        aria-label="Semantic Search"
                        value={semanticQuery}
                        onChange={onSemanticQueryChange}
                        onSubmit={onSemanticSearch}
                        onClear={onClearSemanticSearch}
                        className="flex-1"
                    >
                        <SearchField.Group className="h-10">
                            <Sparkles className="h-4 w-4 text-warning animate-pulse ml-2" />
                            <SearchField.Input placeholder="Search call concepts..." />
                            <SearchField.ClearButton />
                        </SearchField.Group>
                    </SearchField>
                    <Button
                        variant="primary"
                        onPress={onSemanticSearch}
                        isPending={isSearching}
                        isDisabled={!semanticQuery.trim()}
                        className="px-6 font-medium h-10"
                    >
                        Search
                    </Button>
                </div>
            </div>

            {/* Filters & Sorting Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 p-3 rounded-lg border border-default-200 bg-background/50 backdrop-blur-sm shadow-sm">
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                        <Filter className="w-3.5 h-3.5 text-default-500" />
                        <span className="text-xs font-medium text-default-700">Sort:</span>
                    </div>
                    <Select
                        className="w-40"
                        aria-label="Sort by"
                        placeholder="Sort by"
                        defaultSelectedKey={`${currentSort.by}-${currentSort.order}`}
                        selectedKey={`${currentSort.by}-${currentSort.order}`}
                        onSelectionChange={(key) => {
                            const selected = key as string;
                            if (selected) {
                                const [by, order] = selected.split('-');
                                onSortChange({ by: by as 'date' | 'duration', order: order as 'asc' | 'desc' });
                            }
                        }}
                    >
                        <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox selectionMode="single">
                                <ListBox.Item key="date-desc" textValue="Newest First">Newest First</ListBox.Item>
                                <ListBox.Item key="date-asc" textValue="Oldest First">Oldest First</ListBox.Item>
                                <ListBox.Item key="duration-desc" textValue="Longest Duration">Longest Duration</ListBox.Item>
                                <ListBox.Item key="duration-asc" textValue="Shortest Duration">Shortest Duration</ListBox.Item>
                            </ListBox>
                        </Select.Popover>
                    </Select>

                    <div className="w-px h-6 bg-default-200 mx-2 hidden sm:block"></div>

                    <div className="flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4 text-default-500" />
                        <span className="text-sm font-medium text-default-700">Date:</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Input
                            type="date"
                            className="w-32 h-9 text-sm"
                            aria-label="Start Date"
                            value={currentDateFilter.start?.split('T')[0] || ''}
                            onChange={(e) => onDateFilterChange({ ...currentDateFilter, start: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                        />
                        <span className="text-default-400 text-xs">-</span>
                        <Input
                            type="date"
                            className="w-32 h-9 text-sm"
                            aria-label="End Date"
                            value={currentDateFilter.end?.split('T')[0] || ''}
                            onChange={(e) => onDateFilterChange({ ...currentDateFilter, end: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                        />
                    </div>

                    {(currentDateFilter.start || currentDateFilter.end) && (
                        <Button
                            size="sm"
                            variant="danger-soft"
                            className="ml-auto sm:ml-2 h-9"
                            onPress={() => onDateFilterChange({})}
                        >
                            Clear Dates
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

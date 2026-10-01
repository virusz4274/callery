
"use client"

import React, { useMemo, useState, useTransition } from 'react';
import type { Recording, Contact } from '@/lib/types';
import { Button, Chip, SearchField, Select, ListBox, Input, Switch } from '@heroui/react';
import { useToast } from '@/components/toast-provider'; // Correct import path
import { RecordingsTable } from '@/components/recordings-table'; // Resolves to /index.tsx
import { Users, Phone, Clock, BarChart, Search, Sparkles, Filter, Calendar, ArrowUpAz, ArrowDownAz, SlidersHorizontal } from 'lucide-react';
import { searchRecordingsAction } from '@/app/actions/search-actions';
import { authFetch } from '@/lib/api-client';
import { StatsCard } from './dashboard/stats-card';
import { DashboardBackground } from './dashboard/background';

type RecordingsDashboardProps = {
    allRecordings: Recording[];
    allContacts: Contact[];
    filter: { type: string | null; value: string | null };
    searchQuery: string; // Server-side keyword search (URL `q` param)
    stats: {
        totalRecordings: number;
        newThisMonth: number;
        unknownCallers: number;
        avgDuration: number;
    } | null;
    page: number;
    setPage: (page: number) => void;
    totalCount: number;
    itemsPerPage: number;
    onRecordingsChange?: () => void;

    // New Props for Sorting & Filtering
    onSortChange: (sortBy: 'date' | 'duration', sortOrder: 'asc' | 'desc') => void;
    onDateFilterChange: (start?: string, end?: string) => void;
    onArchivedChange: (showArchived: boolean) => void;
    currentSort: { by: 'date' | 'duration'; order: 'asc' | 'desc' };
    currentDateFilter: { start?: string; end?: string };
    showArchived: boolean;
};

export function RecordingsDashboard({
    allRecordings,
    allContacts,
    filter,
    searchQuery,
    stats,
    page,
    setPage,
    totalCount,
    itemsPerPage,
    onRecordingsChange,
    onSortChange,
    onDateFilterChange,
    onArchivedChange,
    currentSort,
    currentDateFilter,
    showArchived
}: RecordingsDashboardProps) {
    const [semanticQuery, setSemanticQuery] = useState('');
    const [semanticState, setSemanticState] = useState<{ query: string; results: Recording[]; totalCount: number } | null>(null);
    const [isSearching, startSearchTransition] = useTransition();
    const semanticResults = semanticState?.results ?? null;

    const { toast } = useToast();

    // Fetch one page of semantic results (server-side vector search).
    const runSemanticSearch = React.useCallback((query: string, targetPage: number) => {
        startSearchTransition(async () => {
            try {
                const response = await searchRecordingsAction(query, targetPage, itemsPerPage);
                if (response.success) {
                    setSemanticState({ query, results: response.results as Recording[], totalCount: response.totalCount });
                } else {
                    throw new Error(response.error || 'Search failed');
                }
            } catch (error) {
                console.error('Search failed:', error);
                toast({
                    title: 'Semantic search failed',
                    description: error instanceof Error ? error.message : 'Please try again.',
                    status: 'danger',
                });
            }
        });
    }, [itemsPerPage, toast]);

    // Active semantic query as the pagination effect's source of truth,
    // set synchronously on submit so page changes fetch the right query.
    const activeSemanticQuery = React.useRef<string | null>(null);

    // Handle Semantic Search
    const handleSemanticSearch = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const trimmed = semanticQuery.trim();
        if (!trimmed) return;
        activeSemanticQuery.current = trimmed;
        if (page === 1) {
            runSemanticSearch(trimmed, 1);
        } else {
            // The pagination effect below fetches page 1 once the state lands.
            setPage(1);
        }
    };

    const clearSemanticSearch = () => {
        setSemanticQuery('');
        setSemanticState(null);
        activeSemanticQuery.current = null;
        setPage(1);
    };

    // While semantic search is active, table pagination drives vector pages.
    React.useEffect(() => {
        if (activeSemanticQuery.current) {
            runSemanticSearch(activeSemanticQuery.current, page);
        }
        // Only re-run when the page changes; query changes go through submit.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page]);

    const handleRetryTranscription = async (recording: Recording) => {
        toast({
            title: 'Starting transcription...',
            status: 'default',
        });

        try {
            const response = await authFetch('/api/transcribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ recordingId: recording.id }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to start transcription');
            }

            toast({
                title: 'Transcription started',
                description: 'The recording is being processed in the background.',
                status: 'success',
            });

            // Refresh so the row shows the new `processing` status.
            onRecordingsChange?.();
        } catch (error) {
            console.error('Retry failed:', error);
            toast({
                title: 'Transcription failed',
                description: error instanceof Error ? error.message : 'Unknown error',
                status: 'danger',
            });
        }
    };

    // Keyword search, contact filter, sorting, and date range all run
    // server-side: `allRecordings` is already the current page. Semantic
    // search swaps in its own paginated result set while active.
    const displayedRecordings = semanticResults || allRecordings || [];
    const displayTotalCount = semanticState ? semanticState.totalCount : totalCount;

    const hasServerFilter = !semanticState && (
        searchQuery !== '' || (filter.type === 'contact' && !!filter.value)
    );

    const summaryStats = useMemo(() => {
        return stats || { totalRecordings: 0, newThisMonth: 0, unknownCallers: 0, avgDuration: 0 };
    }, [stats]);

    return (
        <div className="space-y-8 relative">
            <DashboardBackground />

            <div className="flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                    <div className="flex flex-col gap-2">
                        <h2 className="text-4xl font-bold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                            Dashboard
                        </h2>
                        <p className="text-default-500 text-lg">
                            Overview of your call analytics and history
                        </p>
                    </div>
                </div>
            </div>

            {!semanticResults && (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    <StatsCard
                        title="Total Recordings"
                        value={summaryStats.totalRecordings}
                        trend="+2.5%"
                        trendType="success"
                        icon={Phone}
                        iconClassName="text-primary"
                        iconBgClassName="bg-primary/20"
                        progressValue={70}
                        progressColorClass="from-primary to-primary/60"
                        progressShadowClass="shadow-[0_0_10px_rgba(var(--primary),0.5)]"
                    />

                    <StatsCard
                        title="New This Month"
                        value={`+${summaryStats.newThisMonth}`}
                        trend="+12%"
                        trendType="success"
                        icon={Clock}
                        iconClassName="text-secondary"
                        iconBgClassName="bg-secondary/20"
                        progressValue={45}
                        progressColorClass="from-secondary to-secondary/60"
                        progressShadowClass="shadow-[0_0_10px_rgba(var(--secondary),0.5)]"
                    />

                    <StatsCard
                        title="Unknown Callers"
                        value={summaryStats.unknownCallers}
                        trend="-5%"
                        trendType="warning"
                        icon={Users}
                        iconClassName="text-warning"
                        iconBgClassName="bg-warning/20"
                        progressValue={30}
                        progressColorClass="from-warning to-warning/60"
                        progressShadowClass="shadow-[0_0_10px_rgba(var(--warning),0.5)]"
                    />

                    <StatsCard
                        title="Avg. Duration"
                        value={`${Math.floor(summaryStats.avgDuration / 60)}m ${summaryStats.avgDuration % 60}s`}
                        trendLabel="Stable"
                        trendType="default"
                        icon={BarChart}
                        iconClassName="text-success"
                        iconBgClassName="bg-success/20"
                        progressValue={85}
                        progressColorClass="from-success to-success/60"
                        progressShadowClass="shadow-[0_0_10px_rgba(var(--success),0.5)]"
                    />
                </div>
            )}

            {/* Search Bar Section */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">
                        <Search className="h-5 w-5 text-primary" />
                        Semantic Search
                    </h3>
                    {semanticState && (
                        <div className="flex items-center gap-2 px-1">
                            <span className="text-sm text-default-500 hidden sm:inline-block">
                                Found {semanticState.totalCount} relevant recordings
                            </span>
                            <Chip color="success" variant="soft" size="sm" className="pl-2">
                                Active
                            </Chip>
                            <Button
                                size="sm"
                                variant="danger"
                                className="h-6 min-w-0"
                                onPress={clearSemanticSearch}
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
                        onChange={setSemanticQuery}
                        onSubmit={() => handleSemanticSearch()}
                        onClear={clearSemanticSearch}
                        className="flex-1"
                    >
                        <SearchField.Group className="h-12">
                            <Sparkles className="h-5 w-5 text-warning animate-pulse ml-2" />
                            <SearchField.Input placeholder="Search call concepts (e.g. 'refund request', 'angry customer')..." />
                            <SearchField.ClearButton />
                        </SearchField.Group>
                    </SearchField>
                    <Button
                        variant="primary"
                        onPress={() => handleSemanticSearch()}
                        isPending={isSearching}
                        isDisabled={!semanticQuery.trim()}
                        className="px-8 font-medium h-12"
                    >
                        Search
                    </Button>
                </div>
            </div>

            {/* Filters & Sorting Toolbar */}
            <div className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl border border-default-200 bg-background/50 backdrop-blur-sm shadow-sm">
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-default-500" />
                        <span className="text-sm font-medium text-default-700">Sort:</span>
                    </div>
                    <Select
                        className="w-48"
                        aria-label="Sort by"
                        placeholder="Sort by"
                        defaultSelectedKey={`${currentSort.by}-${currentSort.order}`}
                        selectedKey={`${currentSort.by}-${currentSort.order}`}
                        onSelectionChange={(key) => {
                            const selected = key as string;
                            if (selected) {
                                const [by, order] = selected.split('-');
                                onSortChange(by as 'date' | 'duration', order as 'asc' | 'desc');
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
                        <Calendar className="w-4 h-4 text-default-500" />
                        <span className="text-sm font-medium text-default-700">Date Range:</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Input
                            type="date"
                            className="w-40"
                            aria-label="Start Date"
                            value={currentDateFilter.start || ''}
                            onChange={(e) => onDateFilterChange(e.target.value || undefined, currentDateFilter.end)}
                        />
                        <span className="text-default-400">-</span>
                        <Input
                            type="date"
                            className="w-40"
                            aria-label="End Date"
                            value={currentDateFilter.end || ''}
                            onChange={(e) => onDateFilterChange(currentDateFilter.start, e.target.value || undefined)}
                        />
                    </div>

                    {(currentDateFilter.start || currentDateFilter.end) && (
                        <Button
                            size="sm"
                            variant="danger-soft"
                            className="ml-auto sm:ml-2 h-9"
                            onPress={() => onDateFilterChange(undefined, undefined)}
                        >
                            Clear Dates
                        </Button>
                    )}

                    <div className="w-px h-6 bg-default-200 mx-2 hidden sm:block"></div>

                    <div className="flex items-center gap-2">
                        <Switch
                            isSelected={showArchived}
                            onChange={onArchivedChange}
                            aria-label="Show archived recordings"
                        >
                            <Switch.Control>
                                <Switch.Thumb />
                            </Switch.Control>
                        </Switch>
                        <span className="text-sm font-medium text-default-700">Show archived</span>
                    </div>
                </div>
            </div>

            {hasServerFilter && (
                <div className="flex items-center gap-2 text-sm text-default-500">
                    <Filter className="w-4 h-4" />
                    <span>
                        {totalCount} result{totalCount === 1 ? '' : 's'}
                        {searchQuery !== '' && <> for &ldquo;{searchQuery}&rdquo;</>}
                        {filter.type === 'contact' && !!filter.value && <> in {filter.value}</>}
                        {' '}across your full library
                    </span>
                </div>
            )}

            <RecordingsTable
                recordings={displayedRecordings}
                contacts={allContacts || []}
                page={page}
                setPage={setPage}
                totalCount={displayTotalCount}
                itemsPerPage={itemsPerPage}
                onRecordingsChange={onRecordingsChange}
                onRetryTranscription={handleRetryTranscription}
            />
        </div>
    );
}

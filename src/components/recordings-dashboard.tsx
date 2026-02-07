
"use client"

import React, { useMemo } from 'react';
import type { Recording, Contact } from '@/lib/types';
import { Button, Chip, SearchField, Select, ListBox, Input } from '@heroui/react';
import { RecordingsTable } from '@/components/recordings-table';
import { Users, Phone, Clock, BarChart, Search, Sparkles, Filter, Calendar as CalendarIcon } from 'lucide-react';
import { StatsCard } from './dashboard/stats-card';
import { DashboardBackground } from './dashboard/background';
import { useDashboardState } from '@/hooks/dashboard/use-dashboard-state';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';

type RecordingsDashboardProps = {
    allRecordings: Recording[];
    allContacts: Contact[];
    stats: {
        totalRecordings: number;
        newThisMonth: number;
        unknownCallers: number;
        avgDuration: number;
    } | null;
    itemsPerPage: number;
    onRecordingsChange?: () => void;
};

export function RecordingsDashboard({
    allRecordings,
    allContacts,
    stats,
    itemsPerPage,
    onRecordingsChange,
}: RecordingsDashboardProps) {

    const {
        page,
        setPage,
        currentSort,
        setCurrentSort,
        currentDateFilter,
        setCurrentDateFilter,
        semanticQuery,
        setSemanticQuery,
        semanticResults,
        isSearching,
        handleSemanticSearch,
        clearSemanticSearch,
        handleRetryTranscription,
        filteredRecordings, // Full list kept if needed
        displayTotalCount,
        displayedRecordings
    } = useDashboardState(allRecordings, itemsPerPage);

    const summaryStats = useMemo(() => {
        return stats || { totalRecordings: 0, newThisMonth: 0, unknownCallers: 0, avgDuration: 0 };
    }, [stats]);

    return (
        <div className="space-y-4 relative">
            <DashboardBackground />

            <div className="flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-2">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-3xl font-bold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                            Dashboard
                        </h2>
                        <p className="text-default-500 text-sm">
                            Overview of your call analytics and history
                        </p>
                    </div>
                </div>
            </div>

            {!semanticResults && (
                <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                    <StatsCard
                        title="Total Recordings"
                        value={summaryStats.totalRecordings}
                        icon={Phone}
                        iconClassName="text-accent"
                        iconBgClassName="bg-accent/20"
                        progressValue={70}
                        progressColorClass="from-accent to-accent/60"
                        progressShadowClass="shadow-[0_0_10px_rgba(var(--accent),0.5)]"
                    />

                    <StatsCard
                        title="New This Month"
                        value={`+${summaryStats.newThisMonth}`}
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
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <Search className="h-4 w-4 text-primary" />
                        Semantic Search
                    </h3>
                    {semanticResults && (
                        <div className="flex items-center gap-2 px-1">
                            <span className="text-xs text-default-500 hidden sm:inline-block">
                                Found {semanticResults.length} relevant recordings
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
                        <SearchField.Group className="h-10">
                            <Sparkles className="h-4 w-4 text-warning animate-pulse ml-2" />
                            <SearchField.Input placeholder="Search call concepts..." />
                            <SearchField.ClearButton />
                        </SearchField.Group>
                    </SearchField>
                    <Button
                        variant="primary"
                        onPress={() => handleSemanticSearch()}
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
                                setCurrentSort({ by: by as 'date' | 'duration', order: order as 'asc' | 'desc' });
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
                            onChange={(e) => setCurrentDateFilter(prev => ({ ...prev, start: e.target.value ? new Date(e.target.value).toISOString() : undefined }))}
                        />
                        <span className="text-default-400 text-xs">-</span>
                        <Input
                            type="date"
                            className="w-32 h-9 text-sm"
                            aria-label="End Date"
                            value={currentDateFilter.end?.split('T')[0] || ''}
                            onChange={(e) => setCurrentDateFilter(prev => ({ ...prev, end: e.target.value ? new Date(e.target.value).toISOString() : undefined }))}
                        />
                    </div>

                    {(currentDateFilter.start || currentDateFilter.end) && (
                        <Button
                            size="sm"
                            variant="danger-soft"
                            className="ml-auto sm:ml-2 h-9"
                            onPress={() => setCurrentDateFilter({})}
                        >
                            Clear Dates
                        </Button>
                    )}
                </div>
            </div>

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


"use client"

import React, { useMemo, useState, useTransition } from 'react';
import type { Recording, Contact } from '@/lib/types';
import { Button, Chip, SearchField } from '@heroui/react';
import { RecordingsTable } from '@/components/recordings-table'; // Resolves to /index.tsx
import { Users, Phone, Clock, BarChart, Search, Sparkles, Filter, Calendar, ArrowUpAz, ArrowDownAz, SlidersHorizontal } from 'lucide-react';
import { searchRecordingsAction } from '@/app/actions/search-actions';
import { StatsCard } from './dashboard/stats-card';
import { DashboardBackground } from './dashboard/background';

type RecordingsDashboardProps = {
    allRecordings: Recording[];
    allContacts: Contact[];
    filter: { type: string | null; value: string | null };
    searchQuery: string; // This is the simple client-side filter
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
    currentSort: { by: 'date' | 'duration'; order: 'asc' | 'desc' };
    currentDateFilter: { start?: string; end?: string };
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
    currentSort,
    currentDateFilter
}: RecordingsDashboardProps) {
    const [semanticQuery, setSemanticQuery] = useState('');
    const [semanticResults, setSemanticResults] = useState<Recording[] | null>(null);
    const [isSearching, startSearchTransition] = useTransition();

    // Handle Semantic Search
    const handleSemanticSearch = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!semanticQuery.trim()) return;

        startSearchTransition(async () => {
            const response = await searchRecordingsAction(semanticQuery);
            if (response.success) {
                setSemanticResults(response.results as Recording[]);
            } else {
                console.error('Search failed:', response.error);
                // Optionally show toast error here
            }
        });
    };

    const clearSemanticSearch = () => {
        setSemanticQuery('');
        setSemanticResults(null);
    };

    const filteredRecordings = React.useMemo(() => {
        // If we have semantic results, use those!
        if (semanticResults) {
            return semanticResults;
        }

        if (!allRecordings) return [];
        return allRecordings.filter(rec => {
            const searchLower = searchQuery.toLowerCase();
            const matchesSearch = searchQuery === '' ||
                rec.contactName?.toLowerCase().includes(searchLower) ||
                rec.contactName?.toLowerCase().includes(searchLower) ||
                rec.phoneNumber.includes(searchLower) ||
                rec.summary?.toLowerCase().includes(searchLower) ||
                false; // fallback

            if (!filter.type || !filter.value) {
                return matchesSearch;
            }

            let matchesFilter = false;
            if (filter.type === 'contact') {
                if (filter.value === 'Unknown') {
                    matchesFilter = !rec.contactName;
                } else {
                    matchesFilter = rec.contactName === filter.value;
                }
            } else if (filter.type === 'date') {
                const recDate = new Date(rec.recordedAt);
                const [filterMonth, filterYear] = filter.value?.split(' ') || [];
                matchesFilter = recDate.toLocaleString('default', { month: 'long' }) === filterMonth &&
                    recDate.getFullYear().toString() === filterYear;
            }

            return matchesSearch && matchesFilter;
        });
    }, [allRecordings, searchQuery, filter, semanticResults]);

    // Use semantic results count if active, otherwise totalCount (backend) or filtered count (frontend)
    const displayTotalCount = semanticResults ? semanticResults.length : totalCount;

    // If semantic search is active, pagination is local to the results array for now (or just show all 20)
    // For simplicity, we'll just show all returned semantic results (limit 20) without pagination
    const displayedRecordings = semanticResults || filteredRecordings;

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
                    {semanticResults && (
                        <div className="flex items-center gap-2 px-1">
                            <span className="text-sm text-default-500 hidden sm:inline-block">
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
                    <select
                        className="h-9 rounded-lg border border-default-200 bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        value={`${currentSort.by}-${currentSort.order}`}
                        onChange={(e) => {
                            const [by, order] = e.target.value.split('-');
                            onSortChange(by as 'date' | 'duration', order as 'asc' | 'desc');
                        }}
                    >
                        <option value="date-desc">Newest First</option>
                        <option value="date-asc">Oldest First</option>
                        <option value="duration-desc">Longest Duration</option>
                        <option value="duration-asc">Shortest Duration</option>
                    </select>

                    <div className="w-px h-6 bg-default-200 mx-2 hidden sm:block"></div>

                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-default-500" />
                        <span className="text-sm font-medium text-default-700">Date Range:</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            className="h-9 rounded-lg border border-default-200 bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            value={currentDateFilter.start || ''}
                            onChange={(e) => onDateFilterChange(e.target.value || undefined, currentDateFilter.end)}
                            placeholder="Start Date"
                        />
                        <span className="text-default-400">-</span>
                        <input
                            type="date"
                            className="h-9 rounded-lg border border-default-200 bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            value={currentDateFilter.end || ''}
                            onChange={(e) => onDateFilterChange(currentDateFilter.start, e.target.value || undefined)}
                            placeholder="End Date"
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
            />
        </div>
    );
}

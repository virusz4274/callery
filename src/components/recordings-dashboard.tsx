
"use client"

import React, { useMemo } from 'react';
import type { Recording, Contact } from '@/lib/types';
import { RecordingsTable } from '@/components/recordings-table';
import { StatsGrid } from './dashboard/stats-grid';
import { DashboardToolbar } from './dashboard/dashboard-toolbar';
import { DashboardBackground } from './dashboard/background';
import { useDashboardState } from '@/hooks/dashboard/use-dashboard-state';

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

            {!semanticResults && <StatsGrid stats={summaryStats} />}

            <DashboardToolbar
                semanticQuery={semanticQuery}
                onSemanticQueryChange={setSemanticQuery}
                onSemanticSearch={handleSemanticSearch}
                onClearSemanticSearch={clearSemanticSearch}
                isSearching={isSearching}
                semanticResultsCount={semanticResults ? semanticResults.length : undefined}
                currentSort={currentSort}
                onSortChange={setCurrentSort}
                currentDateFilter={currentDateFilter}
                onDateFilterChange={setCurrentDateFilter}
            />

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

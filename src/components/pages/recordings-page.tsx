'use client';

import React, { useCallback, useMemo, useState, useTransition } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { RecordingsToolbar } from '@/components/recordings/recordings-toolbar';
import { RecordingsTable } from '@/components/recordings-table';
import { useRecordings } from '@/hooks/use-recordings';
import { useUser } from '@/lib/firebase/provider';
import { Spinner } from '@heroui/react';
import { useStats } from '@/hooks/use-stats';
import { useContacts } from '@/hooks/use-contacts';
import { searchRecordingsAction } from '@/app/actions/search-actions';
import { useToast } from '@/components/toast-provider';
import type { Recording } from '@/lib/types';

export function RecordingsPage() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { user } = useUser();

    // -- URL State Management --
    const createQueryString = useCallback(
        (updates: Record<string, string | undefined>) => {
            const params = new URLSearchParams(searchParams.toString());

            for (const [name, value] of Object.entries(updates)) {
                if (value) {
                    params.set(name, value);
                } else {
                    params.delete(name);
                }
            }

            return params.toString();
        },
        [searchParams]
    );

    const updateUrl = useCallback((updates: Record<string, string | undefined>) => {
        const query = createQueryString(updates);
        router.push(query ? `${pathname}?${query}` : pathname);
    }, [router, pathname, createQueryString]);

    // -- Extract State from URL --
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 10;
    const search = searchParams.get('q') || '';
    const sortBy = (searchParams.get('sortBy') as 'date' | 'duration') || 'date';
    const sortOrder = (searchParams.get('order') as 'asc' | 'desc') || 'desc';
    const startDate = searchParams.get('start') || undefined;
    const endDate = searchParams.get('end') || undefined;
    const contactId = searchParams.get('contact') || undefined;

    // -- Data Fetching --
    const queryOptions = useMemo(() => ({
        page,
        limit,
        search, // Note: Hook might need update if it doesn't support 'search' param directly for semantic/text
        sortBy,
        sortOrder,
        startDate,
        endDate,
        contactId,
        includeArchived: false,
    }), [page, limit, search, sortBy, sortOrder, startDate, endDate, contactId]);

    const {
        data: recordings,
        totalCount,
        isLoading: isLoadingRecordings,
        refetch
    } = useRecordings(queryOptions);

    const { data: contacts } = useContacts();
    const { toast } = useToast();

    // -- Semantic Search State --
    const [semanticQuery, setSemanticQuery] = useState('');
    const [semanticResults, setSemanticResults] = useState<Recording[] | null>(null);
    const [semanticTotalCount, setSemanticTotalCount] = useState(0);
    const [isSemanticSearching, startSearchTransition] = useTransition();

    const handleSemanticSearch = useCallback(() => {
        if (!semanticQuery.trim()) return;
        startSearchTransition(async () => {
            const response = await searchRecordingsAction(semanticQuery, 1, limit);
            if (response.success) {
                setSemanticResults(response.results as unknown as Recording[]);
                setSemanticTotalCount(response.totalCount || response.results.length);
            } else {
                toast({ title: 'Search failed', description: response.error, status: 'danger' });
            }
        });
    }, [semanticQuery, limit, toast]);

    const clearSemanticSearch = useCallback(() => {
        setSemanticQuery('');
        setSemanticResults(null);
        setSemanticTotalCount(0);
    }, []);

    // Determine what to display
    const isShowingSemanticResults = !!semanticResults;
    const displayedRecordings = isShowingSemanticResults ? semanticResults : (recordings || []);
    const displayTotalCount = isShowingSemanticResults ? semanticTotalCount : totalCount;

    // -- Handlers --
    const handlePageChange = (newPage: number) => updateUrl({ page: newPage.toString() });

    // -- Render --
    if (!user) {
        return <div className="p-8 text-center">Please log in to view recordings.</div>;
    }

    return (
        <div className="relative space-y-8">
            {/* Background Elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-0 right-[-10%] w-[600px] h-[600px] rounded-full bg-primary/10 blur-3xl opacity-40 animate-pulse" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-secondary/10 blur-3xl opacity-40" />
            </div>

            <div className="flex flex-col gap-6">
                {/* Header */}
                <div className="flex flex-col gap-2">
                    <h1 className="text-4xl font-bold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                        Recordings
                    </h1>
                    <p className="text-default-500 text-lg">
                        Manage and search your call history.
                    </p>
                </div>

                {/* Toolbar */}
                <RecordingsToolbar
                    search={search}
                    onSearchChange={(val) => updateUrl({ q: val || undefined, page: '1' })}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSortChange={(by, order) => updateUrl({ sortBy: by, order, page: '1' })}
                    startDate={startDate}
                    endDate={endDate}
                    onDateChange={(start, end) =>
                        updateUrl({ start: start || undefined, end: end || undefined, page: '1' })
                    }
                    contacts={contacts || []}
                    contactId={contactId}
                    onContactChange={(id) => updateUrl({ contact: id || undefined, page: '1' })}
                    // Semantic Search
                    semanticQuery={semanticQuery}
                    onSemanticQueryChange={setSemanticQuery}
                    onSemanticSearch={handleSemanticSearch}
                    onClearSemanticSearch={clearSemanticSearch}
                    isSemanticSearching={isSemanticSearching}
                    semanticResultsCount={isShowingSemanticResults ? semanticTotalCount : undefined}
                />

                {/* Table */}
                <div className="min-h-[400px]">
                    {isLoadingRecordings && !isShowingSemanticResults ? (
                        <div className="flex justify-center items-center h-64">
                            <Spinner size="lg" />
                        </div>
                    ) : (
                        <>
                            <RecordingsTable
                                recordings={displayedRecordings}
                                totalCount={displayTotalCount}
                                page={isShowingSemanticResults ? 1 : page}
                                itemsPerPage={limit}
                                setPage={handlePageChange}
                                onRecordingsChange={refetch}
                                contacts={contacts || []}
                            />

                            <div className="mt-4 flex justify-between items-center">
                                <div className="text-small text-default-500">
                                    {isShowingSemanticResults
                                        ? `Found ${displayTotalCount} matching recordings`
                                        : `Total ${displayTotalCount} recordings`
                                    }
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

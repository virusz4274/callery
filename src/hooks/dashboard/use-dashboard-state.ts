import { useState, useTransition, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { searchRecordingsAction } from '@/app/actions/search-actions';
import type { Recording } from '@/lib/types';
import { useToast } from '@/components/toast-provider';
import { initializeFirebase } from '@/lib/firebase/client';

export type SortConfig = {
    by: 'date' | 'duration';
    order: 'asc' | 'desc';
};

export type DateFilter = {
    start?: string;
    end?: string;
};

export function useDashboardState(allRecordings: Recording[], itemsPerPage: number = 10) {
    const searchParams = useSearchParams();
    const [page, setPage] = useState(1);

    // Filtering State
    const [currentSort, setCurrentSort] = useState<SortConfig>({ by: 'date', order: 'desc' });
    const [currentDateFilter, setCurrentDateFilter] = useState<DateFilter>({});

    // Semantic Search State
    const [semanticQuery, setSemanticQuery] = useState('');
    const [semanticResults, setSemanticResults] = useState<Recording[] | null>(null);
    const [semanticTotalCount, setSemanticTotalCount] = useState(0);
    const [isSearching, startSearchTransition] = useTransition();

    const { toast } = useToast();

    // Derived State from URL
    const filter = useMemo(() => ({
        type: searchParams.get('filterType'),
        value: searchParams.get('filterValue'),
    }), [searchParams]);

    const searchQuery = searchParams.get('q') || '';

    // Handle Semantic Search
    const handleSemanticSearch = (e?: React.FormEvent | number, targetPage: number = 1) => {
        // If first argument is event, prevent default
        if (e && typeof e !== 'number' && 'preventDefault' in e) e.preventDefault();

        // If called with just a page number as first arg (optional convenience)
        if (typeof e === 'number') targetPage = e;

        if (!semanticQuery.trim()) return;

        startSearchTransition(async () => {
            // If searching new query, reset page to 1
            if (e && typeof e !== 'number') setPage(1);

            const response = await searchRecordingsAction(semanticQuery, targetPage, itemsPerPage);
            if (response.success) {
                setSemanticResults(response.results as Recording[]);
                setSemanticTotalCount(response.totalCount || response.results.length);
                setPage(targetPage);
            } else {
                console.error('Search failed:', response.error);
                toast({
                    title: 'Search failed',
                    description: response.error,
                    status: 'danger',
                });
            }
        });
    };

    const clearSemanticSearch = () => {
        setSemanticQuery('');
        setSemanticResults(null);
        setSemanticTotalCount(0);
        setPage(1);
    };

    const handleRetryTranscription = async (recording: Recording) => {
        toast({ title: 'Starting transcription...', status: 'default' });

        try {
            const { auth } = initializeFirebase();
            const token = await auth.currentUser?.getIdToken();

            if (!token) throw new Error('You must be logged in to transcribe recordings.');

            const response = await fetch('/api/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
        } catch (error) {
            console.error('Retry failed:', error);
            toast({
                title: 'Transcription failed',
                description: error instanceof Error ? error.message : 'Unknown error',
                status: 'danger',
            });
        }
    };

    const filteredRecordings = useMemo(() => {
        // If semantic search is active, return those results directly (they are already filtered & paginated by server)
        if (semanticResults) return semanticResults;

        if (!allRecordings) return [];

        let result = allRecordings.filter(rec => {
            const searchLower = searchQuery.toLowerCase();
            const matchesSearch = searchQuery === '' ||
                rec.contactName?.toLowerCase().includes(searchLower) ||
                rec.phoneNumber.includes(searchLower) ||
                rec.summary?.toLowerCase().includes(searchLower) ||
                false;

            if (!filter.type || !filter.value) return matchesSearch;

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

        // Apply Date Range Filter
        if (currentDateFilter.start || currentDateFilter.end) {
            result = result.filter(rec => {
                const recDate = new Date(rec.recordedAt).getTime();
                const start = currentDateFilter.start ? new Date(currentDateFilter.start).getTime() : -Infinity;
                const end = currentDateFilter.end ? new Date(currentDateFilter.end).getTime() + 86400000 : Infinity; // Add 1 day to include end date
                return recDate >= start && recDate < end;
            });
        }

        // Apply Sorting
        result.sort((a, b) => {
            if (currentSort.by === 'date') {
                const dateA = new Date(a.recordedAt).getTime();
                const dateB = new Date(b.recordedAt).getTime();
                return currentSort.order === 'asc' ? dateA - dateB : dateB - dateA;
            } else {
                return currentSort.order === 'asc' ? a.duration - b.duration : b.duration - a.duration;
            }
        });

        return result;
    }, [allRecordings, searchQuery, filter, semanticResults, currentDateFilter, currentSort]);

    // Derived State for Pagination
    const paginatedRecordings = useMemo(() => {
        // If semantic results are active, they are ALREADY paginated by the server. Return as is.
        if (semanticResults) return semanticResults;

        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        return filteredRecordings.slice(startIndex, endIndex);
    }, [filteredRecordings, page, itemsPerPage, semanticResults]);

    return {
        page,
        setPage: (newPage: number) => {
            if (semanticResults) {
                handleSemanticSearch(undefined, newPage);
            } else {
                setPage(newPage);
            }
        },
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
        filteredRecordings, // Full list (useful for exports or debug)
        displayTotalCount: semanticResults ? semanticTotalCount : filteredRecordings.length,
        displayedRecordings: paginatedRecordings
    };
}

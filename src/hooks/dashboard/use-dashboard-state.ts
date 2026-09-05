import { useState, useTransition, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { searchRecordingsAction } from '@/app/actions/search-actions';
import type { Recording } from '@/lib/types';
import { useToast } from '@/components/toast-provider';
import { transcribeRecordingAction } from '@/app/actions/transcription';
import { logger } from '@/lib/logger';

export type SortConfig = {
    by: 'date' | 'duration';
    order: 'asc' | 'desc';
};

export type DateFilter = {
    start?: string;
    end?: string;
};

export function useDashboardState(itemsPerPage: number = 10) {
    const searchParams = useSearchParams();

    // -- Standard List State --
    const [page, setPage] = useState(1);
    const [currentSort, setCurrentSort] = useState<SortConfig>({ by: 'date', order: 'desc' });
    const [currentDateFilter, setCurrentDateFilter] = useState<DateFilter>({});

    // -- Semantic Search State --
    const [semanticQuery, setSemanticQuery] = useState('');
    const [semanticResults, setSemanticResults] = useState<Recording[] | null>(null);
    const [semanticTotalCount, setSemanticTotalCount] = useState(0);
    const [isSearching, startSearchTransition] = useTransition();

    const { toast } = useToast();

    // Derived State from URL (for initial load / deep linking support if needed later)
    // Currently strictly used for the 'filterType' param in the original code, 
    // but we can likely move this to the container or handle it via initial state if strictly needed.
    // For now, let's keep the filter derivation if it's used for initial "Quick Filters"
    const urlFilter = useMemo(() => ({
        type: searchParams.get('filterType'),
        value: searchParams.get('filterValue'),
    }), [searchParams]);

    // Search param 'q' was used for client-side text filter. 
    // We might want to pass this to the server if we want to support keyword search.
    const urlSearchQuery = searchParams.get('q') || '';

    // -- Handlers --

    const handleSemanticSearch = useCallback((e?: React.FormEvent | number, targetPage: number = 1) => {
        // If first argument is event, prevent default
        if (e && typeof e !== 'number' && 'preventDefault' in e) {
            e.preventDefault();
        }

        // If called with just a page number as first arg
        if (typeof e === 'number') targetPage = e;

        if (!semanticQuery.trim()) return;

        startSearchTransition(async () => {
            // Reset to page 1 if it's a new search (event passed)
            if (e && typeof e !== 'number') setPage(1);

            const response = await searchRecordingsAction(semanticQuery, targetPage, itemsPerPage);
            if (response.success) {
                setSemanticResults(response.results);
                setSemanticTotalCount(response.totalCount || response.results.length);
                setPage(targetPage);
            } else {
                logger.error('Search failed:', response.error);
                toast({
                    title: 'Search failed',
                    description: response.error,
                    status: 'danger',
                });
            }
        });
    }, [semanticQuery, itemsPerPage, toast, setPage]);

    const clearSemanticSearch = useCallback(() => {
        setSemanticQuery('');
        setSemanticResults(null);
        setSemanticTotalCount(0);
        setPage(1);
    }, [setPage]);

    const handleRetryTranscription = useCallback(async (recording: Recording) => {
        toast({ title: 'Starting transcription...', status: 'default' });

        try {
            const response = await transcribeRecordingAction(recording.id.toString());

            if (response.error) {
                throw new Error(response.error);
            }

            toast({
                title: 'Transcription started',
                description: 'The recording is being processed in the background.',
                status: 'success',
            });
        } catch (error) {
            logger.error('Retry failed:', error);
            toast({
                title: 'Transcription failed',
                description: error instanceof Error ? error.message : 'Unknown error',
                status: 'danger',
            });
        }
    }, [toast]);

    // -- State Setters Wrappers --
    // When changing standard filters, we might want to clear semantic search or vice versa?
    // For now, let's keep them independent but semantic results take precedence in the view.

    const handleSetPage = (newPage: number) => {
        if (semanticResults) {
            handleSemanticSearch(undefined, newPage);
        } else {
            setPage(newPage);
        }
    };

    return {
        // State
        page,
        currentSort,
        currentDateFilter,
        semanticQuery,
        semanticResults,
        semanticTotalCount,
        isSearching,
        urlFilter,
        urlSearchQuery,

        // Actions
        setPage: handleSetPage,
        setCurrentSort,
        setCurrentDateFilter,
        setSemanticQuery,
        handleSemanticSearch,
        clearSemanticSearch,
        handleRetryTranscription,
    };
}

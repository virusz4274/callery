'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { searchRecordingsAction } from '@/app/actions/search-actions';
import { useUser } from '@/lib/auth/client';
import type { SemanticSearchMatch } from '@/lib/search/types';

type SearchFilters = { contactId?: string; startDate?: string; endDate?: string };
type SearchState = { owner?: string; mode: 'text' | 'semantic'; query: string; submitted: string; page: number; hasRun: boolean };
const initialState: SearchState = { mode: 'text', query: '', submitted: '', page: 1, hasRun: false };
const noMatches: Record<string, SemanticSearchMatch[]> = {};

export function useSemanticSearch(limit: number, filters: SearchFilters = {}) {
    const { user } = useUser();
    const owner = user?.id;
    const [stored, setStored] = useState<SearchState>(initialState);
    const state = stored.owner === owner ? stored : initialState;
    const { contactId, startDate, endDate } = filters;
    // Filter changes get a new request and page one, never display another scope's matches.
    const scope = `${contactId || ''}:${startDate || ''}:${endDate || ''}`;
    const [pageScope, setPageScope] = useState('');
    const page = pageScope === scope ? state.page : 1;
    const { data, error, isLoading, isValidating, mutate } = useSWR(
        owner && state.mode === 'semantic' && state.submitted
            ? ['semantic-search', owner, state.submitted, page, limit, contactId, startDate, endDate] as const : null,
        async ([, , query, requestedPage, pageSize, contact, start, end]) => {
            const result = await searchRecordingsAction({ query, page: requestedPage, pageSize, contactId: contact, startDate: start, endDate: end });
            if (!result.success) throw new Error(result.error || 'Search failed');
            return result;
        },
        { revalidateOnFocus: false, shouldRetryOnError: false },
    );
    const update = (patch: Partial<SearchState>) => setStored({ ...state, owner, ...patch });
    const search = () => {
        const submitted = state.query.trim();
        if (!submitted) return;
        if (submitted === state.submitted && page === 1 && state.mode === 'semantic') void mutate();
        setPageScope(scope);
        update({ mode: 'semantic', submitted, page: 1, hasRun: true });
    };
    const clear = () => { setStored({ ...initialState, owner, hasRun: state.hasRun }); setPageScope(''); };

    return {
        inputMode: state.mode, setInputMode: (mode: 'text' | 'semantic') => update({ mode }),
        query: state.query, setQuery: (query: string) => update({ query }), submittedQuery: state.submitted,
        results: data?.results ?? null, totalCount: data?.totalCount ?? 0,
        matches: data?.matches ?? noMatches, coverage: data?.coverage,
        resultLimit: data?.resultLimit,
        page, hasMore: data?.hasMore ?? false,
        changePage: (next: number) => { setPageScope(scope); update({ page: next }); },
        error: error instanceof Error ? error.message : undefined,
        retry: () => { void mutate(); }, engineMode: data?.mode, fallbackReason: data?.fallbackReason,
        isSearching: isLoading || isValidating, hasRun: state.hasRun, search, clear,
    };
}

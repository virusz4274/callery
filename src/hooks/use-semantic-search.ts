'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { searchRecordingsAction } from '@/app/actions/search-actions';
import type { Recording } from '@/lib/types';
import type { SemanticFallbackReason, SemanticSearchMode } from '@/lib/db/search';

export function useSemanticSearch(limit: number) {
    const [inputMode, setInputMode] = useState<'text' | 'semantic'>('text');
    const [query, setQuery] = useState('');
    const [submittedQuery, setSubmittedQuery] = useState('');
    const [results, setResults] = useState<Recording[] | null>(null);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [engineMode, setEngineMode] = useState<SemanticSearchMode>();
    const [fallbackReason, setFallbackReason] = useState<SemanticFallbackReason>();
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string>();
    const [hasRun, setHasRun] = useState(false);
    const generation = useRef(0);
    const lastRequest = useRef({ query: '', page: 1 });
    useEffect(() => () => { generation.current++; }, []);

    const run = useCallback(async (text: string, requestedPage: number) => {
        if (!text.trim()) return;
        const request = ++generation.current;
        lastRequest.current = { query: text.trim(), page: requestedPage };
        setHasRun(true); setIsSearching(true); setError(undefined);
        try {
            const response = await searchRecordingsAction(text.trim(), requestedPage, limit);
            if (request !== generation.current) return;
            if (!response.success) throw new Error(response.error || 'Search failed');
            setSubmittedQuery(text.trim()); setPage(requestedPage); setResults(response.results);
            setTotalCount(response.totalCount ?? response.results.length);
            setHasMore(response.hasMore ?? false);
            setEngineMode(response.mode); setFallbackReason(response.fallbackReason);
        } catch (cause) {
            if (request === generation.current) setError(cause instanceof Error ? cause.message : 'Search failed');
        } finally {
            if (request === generation.current) setIsSearching(false);
        }
    }, [limit]);

    const search = useCallback(() => { void run(query, 1); }, [query, run]);
    const changePage = useCallback((next: number) => { void run(submittedQuery, next); }, [submittedQuery, run]);
    const retry = useCallback(() => { void run(lastRequest.current.query, lastRequest.current.page); }, [run]);
    const clear = useCallback(() => {
        generation.current++;
        setQuery(''); setSubmittedQuery(''); setResults(null); setTotalCount(0);
        setPage(1); setHasMore(false); setEngineMode(undefined); setFallbackReason(undefined);
        setIsSearching(false); setError(undefined); setInputMode('text');
    }, []);

    return { inputMode, setInputMode, query, setQuery, submittedQuery, results, totalCount,
        page, hasMore, changePage, error, retry, engineMode, fallbackReason, isSearching, hasRun, search, clear };
}

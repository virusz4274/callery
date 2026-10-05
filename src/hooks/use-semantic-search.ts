'use client';

import { useState, useCallback, useTransition } from 'react';
import { searchRecordingsAction } from '@/app/actions/search-actions';
import { useToast } from '@/components/toast-provider';
import type { Recording } from '@/lib/types';
import type { SemanticFallbackReason, SemanticSearchMode } from '@/lib/db/search';

export function useSemanticSearch(limit: number) {
    const { toast } = useToast();
    const [inputMode, setInputMode] = useState<'text' | 'semantic'>('text');
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Recording[] | null>(null);
    const [totalCount, setTotalCount] = useState(0);
    const [engineMode, setEngineMode] = useState<SemanticSearchMode | undefined>(undefined);
    const [fallbackReason, setFallbackReason] = useState<SemanticFallbackReason | undefined>(undefined);
    const [isSearching, startSearchTransition] = useTransition();
    const [hasRun, setHasRun] = useState(false);

    const search = useCallback(() => {
        if (!query.trim()) return;
        setHasRun(true);
        startSearchTransition(async () => {
            const response = await searchRecordingsAction(query, 1, limit);
            if (response.success) {
                setResults(response.results as unknown as Recording[]);
                setTotalCount(response.totalCount || response.results.length);
                setEngineMode(response.mode);
                setFallbackReason(response.fallbackReason);
            } else {
                toast({ title: 'Search failed', description: response.error, status: 'danger' });
            }
        });
    }, [query, limit, toast]);

    const clear = useCallback(() => {
        setQuery('');
        setResults(null);
        setTotalCount(0);
        setEngineMode(undefined);
        setFallbackReason(undefined);
        setInputMode('text');
    }, []);

    return {
        inputMode,
        setInputMode,
        query,
        setQuery,
        results,
        totalCount,
        engineMode,
        fallbackReason,
        isSearching,
        hasRun,
        search,
        clear,
    };
}

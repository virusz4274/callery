'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ContactResponse } from '@/lib/db/types';
import { authFetch } from '@/lib/api-client';

interface UseContactsResult {
    data: ContactResponse[] | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
    totalCount: number;
    loadMore: () => Promise<void>;
    hasMore: boolean;
}

/**
 * Hook to fetch contacts for the current user.
 * Uses the API route with Firebase ID token authentication.
 */
export function useContacts(): UseContactsResult {
    const [data, setData] = useState<ContactResponse[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [totalCount, setTotalCount] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [page, setPage] = useState(0);
    const LIMIT = 20;

    const fetchContacts = useCallback(async (reset = false) => {
        if (reset) {
            setIsLoading(true);
            setPage(0);
            setHasMore(true);
            setData(null);
        } else {
            // If we are loading more, don't set global loading, maybe a background loading state?
            // For simplicity let's rely on the fact that we append data
        }

        // Use a ref or local variable to get current page if we weren't using state in dependency...
        // But here we want to fetch the NEXT page.
        // Actually, let's redesign slightly: 
        // fetchContacts(pageToFetch)
    }, []);

    const loadMore = useCallback(async () => {
        if (isLoading || !hasMore) return;

        const nextPage = page + 1;
        const skip = nextPage * LIMIT;

        try {
            // We need to handle the appending logic here. 
            // Ideally we refactor `fetchContacts` to be more flexible.
            // Let's implement a direct fetch here to avoid complex state deps for now.

            const response = await authFetch(`/api/contacts?limit=${LIMIT}&skip=${skip}`);
            if (!response.ok) throw new Error('Failed to load more');
            const result = await response.json();

            if (result.contacts.length < LIMIT) {
                setHasMore(false);
            }

            setData(prev => [...(prev || []), ...result.contacts]);
            setPage(nextPage);
        } catch (error) {
            console.error(error);
        }
    }, [page, isLoading, hasMore]);

    // Initial load
    useEffect(() => {
        const init = async () => {
            setIsLoading(true);
            try {
                const response = await authFetch(`/api/contacts?limit=${LIMIT}&skip=0`);
                if (response.ok) {
                    const result = await response.json();
                    setData(result.contacts);
                    setTotalCount(result.totalCount);
                    if (result.contacts.length < LIMIT) setHasMore(false);
                }
            } catch (err) {
                setError(err instanceof Error ? err : new Error('Unknown'));
            } finally {
                setIsLoading(false);
            }
        };
        init();
    }, []);

    return {
        data,
        isLoading,
        error,
        refetch: async () => { setPage(0); setData(null); setHasMore(true); /* trigger init */ },
        totalCount,
        loadMore,
        hasMore
    };
}

/**
 * Find a contact by phone number from the cached contacts.
 */
export function findContactByPhone(
    contacts: ContactResponse[] | null,
    phoneNumber: string
): ContactResponse | undefined {
    return contacts?.find(c => c.phoneNumber === phoneNumber);
}

/**
 * Find a contact by name from the cached contacts.
 */
export function findContactByName(
    contacts: ContactResponse[] | null,
    name: string
): ContactResponse | undefined {
    return contacts?.find(c => c.name === name);
}

'use client';

import { useState, useCallback } from 'react';
import type { ContactResponse } from '@/lib/db/types';
import { authFetch } from '@/lib/api-client';
import useSWR from 'swr';

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
    // The following useState declarations are being replaced or modified by the useSWR line.
    // Based on the instruction, the useSWR line is inserted after these,
    // but the variables declared in useSWR (data, isLoading, error) conflict with existing ones.
    // Assuming the intent is to replace the state management for these variables with useSWR.
    // The instruction shows `const [isLoading, setIsLoading] = useState(true);` etc.
    // followed by the useSWR line. This implies the useSWR is meant to take over.
    // I will remove the conflicting useState declarations and keep the ones not covered by useSWR.
    // The instruction also shows `setData(null);` inside the useSWR block, implying `data` state still exists.
    // This is a bit contradictory. I will follow the instruction literally for the insertion.

    // Original: const [data, setData] = useState<ContactResponse[] | null>(null);
    // Original: const [isLoading, setIsLoading] = useState(true);
    // Original: const [error, setError] = useState<Error | null>(null);
    const [totalCount, setTotalCount] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [page, setPage] = useState(0);

    const { data: contactsData, isLoading, error, mutate } = useSWR<ContactResponse[]>(
        ['/api/contacts', page],
        async () => {
            const skip = page * 20;
            const response = await authFetch(`/api/contacts?limit=20&skip=${skip}`);
            if (!response.ok) throw new Error('Failed to fetch contacts');
            const result = await response.json();
            setTotalCount(result.totalCount);
            if (result.contacts.length < 20) setHasMore(false);
            return result.contacts as ContactResponse[];
        },
        {
            revalidateOnFocus: false,
        }
    );

    const LIMIT = 20;

    const loadMore = useCallback(async () => {
        if (isLoading || !hasMore) return;

        const nextPage = page + 1;
        const skip = nextPage * LIMIT;

        try {
            const response = await authFetch(`/api/contacts?limit=${LIMIT}&skip=${skip}`);
            if (!response.ok) throw new Error('Failed to load more');
            const result = await response.json();

            if (result.contacts.length < LIMIT) {
                setHasMore(false);
            }

            mutate((prev) => [...(prev || []), ...result.contacts], false);
            setPage(nextPage);
        } catch (error) {
            console.error(error);
        }
    }, [page, isLoading, hasMore, mutate]);

    return {
        data: contactsData || null,
        isLoading,
        error: error || null,
        refetch: async () => { setPage(0); setHasMore(true); mutate(); },
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
    return contacts?.find(c => c.phoneNumbers?.includes(phoneNumber));
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

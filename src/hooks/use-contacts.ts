'use client';

import React, { useCallback } from 'react';
import type { ContactResponse } from '@/lib/db/types';
import { authFetch } from '@/lib/api-client';
import useSWRInfinite from 'swr/infinite';

interface UseContactsResult {
    data: ContactResponse[] | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
    totalCount: number;
    loadMore: () => void;
    hasMore: boolean;
    isLoadingMore: boolean;
}

const LIMIT = 20;

/**
 * Hook to fetch contacts for the current user.
 * Uses the API route with Firebase ID token authentication.
 */
export function useContacts(search?: string): UseContactsResult {
    const trimmedSearch = search?.trim() || '';

    const getKey = (pageIndex: number, previousPageData: ContactResponse[] | null) => {
        // Validation: if previous page is empty, we reached the end
        if (previousPageData && !previousPageData.length) return null;

        // SWR key for this page
        const skip = pageIndex * LIMIT;
        const params = new URLSearchParams({ limit: String(LIMIT), skip: String(skip) });
        if (trimmedSearch) params.set('search', trimmedSearch);
        return `/api/contacts?${params.toString()}`;
    };

    const { data: pages, error, size, setSize, mutate, isLoading } = useSWRInfinite<ContactResponse[]>(
        getKey,
        async (url: string) => {
            const response = await authFetch(url);
            if (!response.ok) throw new Error('Failed to fetch contacts');
            const result = await response.json();
            // useSWRInfinite expects an array per page; attach totalCount metadata.
            const contacts = result.contacts as ContactResponse[];
            (contacts as any).totalCount = result.totalCount;
            return contacts;
        },
        {
            revalidateOnFocus: false,
            initialSize: 1,
        }
    );

    // A new search targets a new result set: restart infinite scroll at page 1.
    const prevSearch = React.useRef(trimmedSearch);
    React.useEffect(() => {
        if (prevSearch.current !== trimmedSearch) {
            prevSearch.current = trimmedSearch;
            setSize(1);
        }
    }, [trimmedSearch, setSize]);

    // Flatten pages into a single array
    const contactsData = pages ? pages.flat() : null;

    // Extract totalCount from the first page if available
    const totalCount = pages && pages[0] ? (pages[0] as any).totalCount : 0;

    const hasMore = contactsData ? contactsData.length < totalCount : true;
    const isLoadingMore = !!(isLoading || (size > 0 && pages && typeof pages[size - 1] === 'undefined'));

    const loadMore = useCallback(() => {
        if (isLoadingMore || !hasMore) return;
        setSize(size + 1);
    }, [isLoadingMore, hasMore, setSize, size]);

    return {
        data: contactsData || null,
        isLoading: isLoading && !contactsData, // True only on initial load
        error: error || null,
        refetch: async () => { await mutate(); },
        totalCount,
        loadMore,
        hasMore,
        isLoadingMore
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

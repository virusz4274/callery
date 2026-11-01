'use client';

import { useCallback, useRef } from 'react';
import type { ContactResponse } from '@/lib/db/types';
import { authFetch } from '@/lib/api-client';
import useSWRInfinite from 'swr/infinite';
import { useUser } from '@/lib/auth/client';
import { contactPageKey } from '@/lib/contact-cache-keys';

interface UseContactsResult {
    data: ContactResponse[] | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
    totalCount: number;
    loadMore: () => void;
    hasMore: boolean;
    isLoadingMore: boolean;
    isLoadMoreError: boolean;
}

interface ContactsPageResponse {
    contacts: ContactResponse[];
    totalCount: number;
    limit: number;
    skip: number;
}

const LIMIT = 20;

/**
 * Hook to fetch contacts for the current user.
 * Uses the API route with Better Auth session authentication.
 */
export function useContacts(search: string = ''): UseContactsResult {
    const { user } = useUser();
    const loadingQueries = useRef(new Set<string>());
    const query = search.trim();
    const getKey = (pageIndex: number, previousPageData: ContactsPageResponse | null) => {
        if (!user) return null;
        // Validation: if previous page is empty, we reached the end
        if (previousPageData && (previousPageData.contacts.length === 0 || pageIndex * LIMIT >= previousPageData.totalCount)) return null;

        // SWR key for this page
        return contactPageKey(user.id, query, pageIndex);
    };

    const { data: pages, error, size, setSize, mutate, isLoading } = useSWRInfinite<ContactsPageResponse>(
        getKey,
        async ([, , search, page]: ReturnType<typeof contactPageKey>) => {
            const url = `/api/contacts?limit=${LIMIT}&skip=${page * LIMIT}${search ? `&search=${encodeURIComponent(search)}` : ''}`;
            const response = await authFetch(url);
            if (!response.ok) throw new Error('Failed to fetch contacts');
            return (await response.json()) as ContactsPageResponse;
        },
        {
            revalidateOnFocus: true,
            initialSize: 1,
            persistSize: false,
            keepPreviousData: false,
        }
    );

    // Flatten pages into a single array
    const contactsData = user && pages ? pages.flatMap((page) => page.contacts) : null;

    // Extract totalCount from the first page if available
    const totalCount = user ? pages?.[0]?.totalCount ?? 0 : 0;

    const hasMore = contactsData ? contactsData.length < totalCount : false;
    const isLoadingMore = !error && !!(isLoading || (size > 0 && pages && typeof pages[size - 1] === 'undefined'));

    const loadMore = useCallback(() => {
        const requestKey = `${user?.id}:${query}`;
        if (!user || loadingQueries.current.has(requestKey) || isLoadingMore || !hasMore || error) return;
        loadingQueries.current.add(requestKey);
        void setSize(current => current + 1).catch(() => {}).finally(() => { loadingQueries.current.delete(requestKey); });
    }, [user, query, isLoadingMore, hasMore, error, setSize]);

    return {
        data: contactsData || null,
        isLoading: isLoading && !contactsData, // True only on initial load
        error: error || null,
        refetch: async () => { await mutate(); },
        totalCount,
        loadMore,
        hasMore,
        isLoadingMore,
        isLoadMoreError: !!error && !!pages && size > pages.length,
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

'use client';

import useSWR from 'swr';
import { authFetch } from '@/lib/api-client';

// A separate, stable request keeps the library total independent of the search.
// The URL also participates in the existing contact-sync cache revalidation.
export function useContactsLibraryCount(userId: string | undefined) {
    const { data, error, isLoading, mutate } = useSWR<number>(
        userId ? ['/api/contacts?limit=1&skip=0', userId] : null,
        async ([url]) => {
            const response = await authFetch(url);
            if (!response.ok) throw new Error('Failed to fetch contact total');
            const body = await response.json();
            return body.totalCount;
        },
        { revalidateOnFocus: true },
    );

    return {
        totalCount: data,
        isLoading,
        error,
        retry: async () => { await mutate(); },
    };
}

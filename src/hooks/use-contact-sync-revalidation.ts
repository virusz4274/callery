'use client';

import { useEffect, useRef } from 'react';
import { useSWRConfig } from 'swr';
import type { User } from '@/lib/types';

export function isContactDependentCacheKey(key: unknown): boolean {
    if (typeof key === 'string') return key.includes('/api/contacts');
    return Array.isArray(key) && typeof key[0] === 'string' && (
        key[0].includes('/api/contacts') || ['recordings', 'filesystem', 'recording-details', 'contact-detail'].includes(key[0])
    );
}

/** Profile polling runs only during an active sync; completion invalidates all affected views. */
export function useContactSyncRevalidation(userId: string | undefined, googleSync: User['googleSync'] | undefined) {
    const { mutate, cache } = useSWRConfig();
    const seen = useRef<string | null>(null);
    const version = userId && googleSync?.status === 'completed' && googleSync.lastSyncedAt
        ? `${userId}:${googleSync.lastSyncedAt}` : null;
    useEffect(() => {
        if (!userId) seen.current = null;
        if (!version || seen.current === version) return;
        seen.current = version;
        // SWR's predicate mutation skips the infinite-list aggregate keys.
        const contactLists = Array.from(cache.keys()).filter(key => key.startsWith('$inf$') && key.includes('/api/contacts'));
        void Promise.all([mutate(isContactDependentCacheKey), ...contactLists.map(key => mutate(key))]);
    }, [cache, mutate, userId, version]);
}

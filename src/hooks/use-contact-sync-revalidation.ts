'use client';

import { useEffect, useRef } from 'react';
import { useSWRConfig } from 'swr';
import type { User } from '@/lib/types';
import { isContactDependentCacheKey, ownedContactListKeys } from '@/lib/contact-cache-keys';

/** Profile polling runs only during an active sync; completion invalidates all affected views. */
export function useContactSyncRevalidation(userId: string | undefined, googleSync: User['googleSync'] | undefined) {
    const { mutate, cache } = useSWRConfig();
    const seen = useRef<string | null>(null);
    const version = userId && googleSync?.status === 'completed' && googleSync.lastSyncedAt
        ? `${userId}:${googleSync.lastSyncedAt}` : null;
    useEffect(() => {
        if (!userId) seen.current = null;
        if (!userId || !version || seen.current === version) return;
        seen.current = version;
        // SWR's predicate mutation skips the infinite-list aggregate keys.
        const contactLists = ownedContactListKeys(cache, userId);
        void Promise.all([mutate(key => isContactDependentCacheKey(key, userId)), ...contactLists.map(key => mutate(key))]).catch(() => undefined);
    }, [cache, mutate, userId, version]);
}

import { unstable_serialize } from 'swr/infinite';

export const contactPageKey = (subject: string, search: string, page: number) => ['contacts', subject, search, page] as const;

export function isContactDependentCacheKey(key: unknown, subject: string): boolean {
    return Array.isArray(key) && key[1] === subject && typeof key[0] === 'string'
        && (key[0].startsWith('/api/contacts?') || ['contacts', 'recordings', 'filesystem', 'recording-details', 'contact-detail'].includes(key[0]));
}

/** Infinite-list aggregate keys are opaque. Derive them from owned page metadata
 * instead of matching serialized owner IDs or invalidating another user's list. */
export function ownedContactListKeys(cache: { keys(): IterableIterator<string>; get(key: string): unknown }, subject: string): string[] {
    const keys = new Set<string>();
    for (const key of cache.keys()) {
        const entry = cache.get(key);
        const page = entry && typeof entry === 'object' && '_k' in entry ? entry._k : undefined;
        if (Array.isArray(page) && page[0] === 'contacts' && page[1] === subject && typeof page[2] === 'string') {
            keys.add(unstable_serialize(() => contactPageKey(subject, page[2], 0)));
        }
    }
    return [...keys];
}

import pLimit from 'p-limit';

/** Return failures so callers retain their metadata and can retry safely. */
export async function removeStoredObjects(
    keys: string[],
    remove: (key: string) => Promise<void>,
): Promise<string[]> {
    const limit = pLimit(8);
    const failures: string[] = [];
    await Promise.all([...new Set(keys.filter(Boolean))].map(key => limit(async () => {
        try { await remove(key); }
        catch { failures.push(key); }
    })));
    return failures;
}

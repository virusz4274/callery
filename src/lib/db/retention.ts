import { deleteRecordings } from '@/lib/db/recordings';
import { decrementStorageUsed } from '@/lib/db/users';
import { deleteFromR2 } from '@/lib/r2';
import { removeStoredObjects } from '@/lib/storage-cleanup';

export type DeletionPolicy = 'never' | '3m' | '6m' | '1y';

const POLICY_MONTHS: Record<Exclude<DeletionPolicy, 'never'>, number> = {
    '3m': 3,
    '6m': 6,
    '1y': 12,
};

/** Cutoff date for a retention policy: recordings older than this expire. */
export function cutoffForPolicy(policy: DeletionPolicy, now: Date = new Date()): Date | null {
    if (policy === 'never') return null;
    const months = POLICY_MONTHS[policy];
    if (!months) return null;
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - months);
    return cutoff;
}

export interface PurgeSummary {
    usersProcessed: number;
    recordingsDeleted: number;
    bytesReclaimed: number;
    errors: string[];
}

export async function purgeExpiredRecordings(): Promise<PurgeSummary> {
    const { getExpiredRecordings } = await import('./recordings');
    const batches = await getExpiredRecordings(100);
    const summary: PurgeSummary = { usersProcessed: batches.length, recordingsDeleted: 0, bytesReclaimed: 0, errors: [] };
    for (const { authSubject, recordings } of batches) {
        const failures = await removeStoredObjects(recordings.map(r => r.r2Key), deleteFromR2);
        summary.errors.push(...failures);
        const failed = new Set(failures);
        const ids = recordings.filter(r => !failed.has(r.r2Key)).map(r => r._id.toString());
        if (!ids.length) continue;
        const deleted = await deleteRecordings(ids, authSubject);
        const bytes = deleted.reduce((sum, r) => sum + r.fileSize, 0);
        summary.recordingsDeleted += deleted.length;
        summary.bytesReclaimed += bytes;
        if (bytes) await decrementStorageUsed(authSubject, bytes);
    }
    return summary;
}

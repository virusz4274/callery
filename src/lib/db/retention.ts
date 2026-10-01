import { getMongoDb, Collections } from '@/lib/mongodb';
import { deleteRecordings } from '@/lib/db/recordings';
import { decrementStorageUsed } from '@/lib/db/users';
import { deleteFromR2 } from '@/lib/r2';
import { reportUsage } from '@/lib/stripe/usage';
import type { User } from '@/lib/db/types';
import { logger } from '@/lib/logger';

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

const BATCH_SIZE = 100;

/**
 * Enforce every user's automatic deletion policy.
 *
 * For each user with a policy other than `never`, recordings with
 * `recordedAt` older than the cutoff are deleted from MongoDB and R2,
 * with storage usage decremented (and refunded to Stripe) exactly like a
 * manual delete.
 */
export async function purgeExpiredRecordings(): Promise<PurgeSummary> {
    const db = await getMongoDb();
    const summary: PurgeSummary = { usersProcessed: 0, recordingsDeleted: 0, bytesReclaimed: 0, errors: [] };

    const users = await db
        .collection<User>(Collections.USERS)
        .find({ 'storageSettings.deletionPolicy': { $in: ['3m', '6m', '1y'] } })
        .project({ authSubject: 1, storageSettings: 1 })
        .toArray();

    for (const user of users) {
        const policy = user.storageSettings?.deletionPolicy as DeletionPolicy | undefined;
        const cutoff = policy ? cutoffForPolicy(policy) : null;
        if (!cutoff) continue;
        summary.usersProcessed++;

        try {
            // Page through expired recordings oldest-first.
            for (;;) {
                const expired = await db
                    .collection(Collections.RECORDINGS)
                    .find({ authSubject: user.authSubject, recordedAt: { $lt: cutoff } })
                    .project({ _id: 1 })
                    .sort({ recordedAt: 1 })
                    .limit(BATCH_SIZE)
                    .toArray();

                if (expired.length === 0) break;

                const ids = expired.map((doc) => doc._id.toString());
                const deleted = await deleteRecordings(ids, user.authSubject);
                summary.recordingsDeleted += deleted.length;

                let batchBytes = 0;
                await Promise.all(
                    deleted.map(async (recording) => {
                        try {
                            await deleteFromR2(recording.r2Key);
                            batchBytes += recording.fileSize;
                        } catch (error) {
                            logger.error(`[retention] R2 delete failed for ${recording.r2Key}:`, error);
                        }
                    })
                );

                if (batchBytes > 0) {
                    summary.bytesReclaimed += batchBytes;
                    await decrementStorageUsed(user.authSubject, batchBytes);
                    await reportUsage(user.authSubject, 'storage', -(batchBytes / (1024 * 1024 * 1024)));
                }

                if (expired.length < BATCH_SIZE) break;
            }
        } catch (error) {
            const message = `purge failed for ${user.authSubject}: ${error instanceof Error ? error.message : error}`;
            logger.error(`[retention] ${message}`);
            summary.errors.push(message);
        }
    }

    return summary;
}

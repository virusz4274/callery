'use server';

import { logger } from '@/lib/logger';

import { Recording, User } from '@/lib/db/types';
import { parseObjectId } from '@/lib/admin-auth';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { deleteFromR2 } from '@/lib/r2';
import { removeStoredObjects } from '@/lib/storage-cleanup';
import { requireCurrentAdmin } from './auth';
import { removeRecordingDerivedData } from '@/lib/db/recording-derived-data';

export interface OrphanCleanupResult {
    found: number;
    deletedDb: number;
    /** Acknowledged deletions of distinct keys; storage may already be absent. */
    deletedR2: number;
    failedCount: number;
    remaining: number;
}

function getOrphanedRecordingsPipeline() {
    return [
        {
            $lookup: {
                from: Collections.USERS,
                localField: 'authSubject',
                foreignField: 'authSubject',
                as: 'user',
            },
        },
        {
            $match: {
                user: { $size: 0 },
            },
        },
    ];
}

function serializeRecording(rec: Recording) {
    return {
        ...rec,
        id: rec._id.toString(),
        _id: undefined,
        contactId: rec.contactId ? rec.contactId.toString() : null,
        fullTranscript: rec.fullTranscript ? JSON.parse(JSON.stringify(rec.fullTranscript)) : undefined,
        recordedAt: rec.recordedAt.toISOString(),
        createdAt: rec.createdAt.toISOString(),
        updatedAt: rec.updatedAt.toISOString(),
    };
}

/**
 * Get all recordings for a specific user.
 */
export async function getUserRecordings(userId: string) {
    await requireCurrentAdmin();

    const db = await getMongoDb();

    const user = await db.collection<User>(Collections.USERS).findOne({
        _id: parseObjectId(userId, 'userId'),
    });

    if (!user) {
        return [];
    }

    const recordings = await db
        .collection<Recording>(Collections.RECORDINGS)
        .find({ authSubject: user.authSubject })
        .sort({ recordedAt: -1 })
        .toArray();

    return recordings.map(serializeRecording);
}

/**
 * Get count of orphaned recordings (recordings with no matching user).
 */
export async function getOrphanedRecordingsCount() {
    await requireCurrentAdmin();

    const db = await getMongoDb();

    const orphans = await db
        .collection(Collections.RECORDINGS)
        .aggregate([...getOrphanedRecordingsPipeline(), { $count: 'count' }])
        .toArray();

    return orphans[0]?.count || 0;
}

/**
 * Cleanup orphaned recordings (delete from DB and R2).
 */
export async function cleanupOrphanedRecordings(): Promise<OrphanCleanupResult> {
    await requireCurrentAdmin();

    const db = await getMongoDb();
    const orphans = await db
        .collection<Recording>(Collections.RECORDINGS)
        .aggregate(getOrphanedRecordingsPipeline())
        .toArray();

    const keys = [...new Set(orphans.map(recording => recording.r2Key).filter(Boolean))];
    const failedKeys = new Set(await removeStoredObjects(keys, deleteFromR2));
    const safeIds = orphans.filter(recording => !recording.r2Key || !failedKeys.has(recording.r2Key))
        .map(recording => recording._id);
    const failedCount = orphans.length - safeIds.length;
    if (failedCount) logger.warn(`[orphan-cleanup] Retained ${failedCount} recordings for storage deletion retry.`);

    // Storage comes first. A crash or failed database write leaves the exact
    // object references available for an idempotent retry.
    await removeRecordingDerivedData(safeIds.map(id => id.toString()), undefined, db);
    const deletedDb = safeIds.length ? (await db.collection(Collections.RECORDINGS).deleteMany({
        _id: { $in: safeIds },
    })).deletedCount : 0;
    const remaining = await db.collection(Collections.RECORDINGS)
        .aggregate([...getOrphanedRecordingsPipeline(), { $count: 'count' }]).toArray();

    return {
        found: orphans.length,
        deletedDb,
        deletedR2: keys.length - failedKeys.size,
        failedCount,
        remaining: remaining[0]?.count || 0,
    };
}

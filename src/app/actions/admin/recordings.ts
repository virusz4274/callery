'use server';

import { logger } from '@/lib/logger';

import { Recording, User } from '@/lib/db/types';
import { parseObjectId } from '@/lib/admin-auth';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { deleteFromR2 } from '@/lib/r2';
import { requireCurrentAdmin } from './auth';

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
        summaryEmbedding: undefined,
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
export async function cleanupOrphanedRecordings() {
    await requireCurrentAdmin();

    const db = await getMongoDb();
    const orphans = await db
        .collection<Recording>(Collections.RECORDINGS)
        .aggregate(getOrphanedRecordingsPipeline())
        .toArray();

    if (orphans.length === 0) {
        return { deletedCount: 0 };
    }

    let deletedR2 = 0;
    await Promise.all(
        orphans.map(async (rec) => {
            if (!rec.r2Key) {
                return;
            }

            try {
                await deleteFromR2(rec.r2Key);
                deletedR2++;
            } catch (error) {
                logger.error(`Failed to delete orphan R2 file ${rec.r2Key}`, error);
            }
        })
    );

    const orphanIds = orphans.map((orphan) => orphan._id);
    const deleteResult = await db.collection(Collections.RECORDINGS).deleteMany({
        _id: { $in: orphanIds },
    });

    return {
        found: orphans.length,
        deletedDb: deleteResult.deletedCount,
        deletedR2,
    };
}

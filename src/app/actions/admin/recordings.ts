'use server';

import { getMongoDb, Collections } from '@/lib/mongodb';
import { User, Recording } from '@/lib/db/types';
import { ObjectId } from 'mongodb';
import { deleteFromR2 } from '@/lib/r2';

/**
 * Get all recordings for a specific user.
 */
export async function getUserRecordings(userId: string) {
    const db = await getMongoDb();

    // First get the user to find their firebaseUid
    const user = await db.collection<User>(Collections.USERS).findOne({
        _id: new ObjectId(userId)
    });

    if (!user) return [];

    const recordings = await db.collection(Collections.RECORDINGS)
        .find({ firebaseUid: user.firebaseUid })
        .sort({ recordedAt: -1 })
        .toArray();

    return recordings.map(rec => ({
        ...rec,
        id: rec._id.toString(),
        _id: undefined,
        contactId: rec.contactId ? rec.contactId.toString() : null, // Convert to string or null
        fullTranscript: rec.fullTranscript ? JSON.parse(JSON.stringify(rec.fullTranscript)) : undefined, // Deep cleanse for safety
        summaryEmbedding: undefined, // Don't send embeddings to client (too heavy/non-serializable usually)
        recordedAt: rec.recordedAt.toISOString(),
        createdAt: rec.createdAt.toISOString(),
        updatedAt: rec.updatedAt.toISOString(),
        // Explicitly pass other safe fields to allow '...' spread below if needed, or just let '...rec' handle primitives
        // but carefully override the dangerous ones above.
    }));
}

/**
 * Get count of orphaned recordings (recordings with no matching user).
 */
export async function getOrphanedRecordingsCount() {
    const db = await getMongoDb();

    // Find recordings where the firebaseUid does not exist in the users collection
    const orphans = await db.collection(Collections.RECORDINGS).aggregate([
        {
            $lookup: {
                from: Collections.USERS,
                localField: 'firebaseUid',
                foreignField: 'firebaseUid',
                as: 'user'
            }
        },
        {
            $match: {
                user: { $size: 0 }
            }
        },
        {
            $count: 'count'
        }
    ]).toArray();

    return orphans[0]?.count || 0;
}

/**
 * Cleanup orphaned recordings (delete from DB and R2).
 */
export async function cleanupOrphanedRecordings() {
    const db = await getMongoDb();

    // 1. Find orphans
    const orphans = await db.collection<Recording>(Collections.RECORDINGS).aggregate([
        {
            $lookup: {
                from: Collections.USERS,
                localField: 'firebaseUid',
                foreignField: 'firebaseUid',
                as: 'user'
            }
        },
        {
            $match: {
                user: { $size: 0 }
            }
        }
    ]).toArray();

    if (orphans.length === 0) return { deletedCount: 0 };

    // 2. Delete R2 files
    let deletedR2 = 0;
    await Promise.all(orphans.map(async (rec) => {
        if (rec.r2Key) {
            try {
                await deleteFromR2(rec.r2Key);
                deletedR2++;
            } catch (e) {
                console.error(`Failed to delete orphan R2 file ${rec.r2Key}`, e);
            }
        }
    }));

    // 3. Delete from MongoDB
    const orphanIds = orphans.map(o => o._id);
    const deleteResult = await db.collection(Collections.RECORDINGS).deleteMany({
        _id: { $in: orphanIds }
    });

    return {
        found: orphans.length,
        deletedDb: deleteResult.deletedCount,
        deletedR2
    };
}

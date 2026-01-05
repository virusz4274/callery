import { ObjectId } from 'mongodb';
import { getMongoDb, Collections } from '@/lib/mongodb';
import type { Recording, CreateRecordingInput, UpdateRecordingInput, RecordingResponse } from './types';
import { getSignedR2Url } from '@/lib/r2';

/**
 * Convert a Recording document to API response format.
 */
export function toRecordingResponse(recording: Recording, playbackUrl?: string): RecordingResponse {
    return {
        id: recording._id.toString(),
        firebaseUid: recording.firebaseUid,
        contactId: recording.contactId?.toString() || null,
        contactName: recording.contactName,
        phoneNumber: recording.phoneNumber,
        r2Key: recording.r2Key,
        fileName: recording.fileName,
        originalFileName: recording.originalFileName,
        fileSize: recording.fileSize,
        mimeType: recording.mimeType,
        duration: recording.duration,
        recordedAt: recording.recordedAt.toISOString(),
        createdAt: recording.createdAt.toISOString(),
        updatedAt: recording.updatedAt.toISOString(),
        transcriptionStatus: recording.transcriptionStatus,
        transcriptSnippet: recording.transcriptSnippet,
        tags: recording.tags,
        isStarred: recording.isStarred,
        isArchived: recording.isArchived,
        playbackUrl,
    };
}

/**
 * Get all recordings for a user.
 */
export async function getRecordingsByUser(
    firebaseUid: string,
    options?: {
        limit?: number;
        skip?: number;
        includeArchived?: boolean;
    }
): Promise<Recording[]> {
    const db = await getMongoDb();

    const query: Record<string, unknown> = { firebaseUid };
    if (!options?.includeArchived) {
        query.isArchived = { $ne: true };
    }

    const recordings = await db
        .collection<Recording>(Collections.RECORDINGS)
        .find(query)
        .sort({ recordedAt: -1 })
        .skip(options?.skip || 0)
        .limit(options?.limit || 100)
        .toArray();

    return recordings;
}

/**
 * Get a single recording by ID.
 */
export async function getRecordingById(
    recordingId: string,
    firebaseUid: string
): Promise<Recording | null> {
    const db = await getMongoDb();

    return db.collection<Recording>(Collections.RECORDINGS).findOne({
        _id: new ObjectId(recordingId),
        firebaseUid,
    });
}

/**
 * Create a new recording.
 */
export async function createRecording(data: CreateRecordingInput): Promise<Recording> {
    const db = await getMongoDb();
    const now = new Date();

    const recordingDoc = {
        ...data,
        createdAt: now,
        updatedAt: now,
    };

    const result = await db
        .collection<Recording>(Collections.RECORDINGS)
        .insertOne(recordingDoc as Recording);

    // Update user stats
    const { updateUserRecordingStats } = await import('./users');
    await updateUserRecordingStats(data.firebaseUid, {
        count: 1,
        duration: data.duration,
    });

    return {
        ...recordingDoc,
        _id: result.insertedId,
    } as Recording;
}

/**
 * Update an existing recording.
 */
export async function updateRecording(
    recordingId: string,
    firebaseUid: string,
    data: UpdateRecordingInput
): Promise<Recording | null> {
    const db = await getMongoDb();

    const result = await db.collection<Recording>(Collections.RECORDINGS).findOneAndUpdate(
        { _id: new ObjectId(recordingId), firebaseUid },
        {
            $set: {
                ...data,
                updatedAt: new Date(),
            }
        },
        { returnDocument: 'after' }
    );

    return result;
}

/**
 * Delete a recording by ID.
 * Note: This only deletes from MongoDB. R2 deletion should be handled separately.
 */
export async function deleteRecording(
    recordingId: string,
    firebaseUid: string
): Promise<Recording | null> {
    const db = await getMongoDb();

    const result = await db.collection<Recording>(Collections.RECORDINGS).findOneAndDelete({
        _id: new ObjectId(recordingId),
        firebaseUid,
    });

    if (result) {
        // Update user stats
        const { updateUserRecordingStats } = await import('./users');
        await updateUserRecordingStats(firebaseUid, {
            count: -1,
            duration: -result.duration,
        });
    }

    return result;
}

/**
 * Delete multiple recordings by IDs.
 * Returns the deleted recordings for R2 cleanup.
 */
export async function deleteRecordings(
    recordingIds: string[],
    firebaseUid: string
): Promise<Recording[]> {
    const db = await getMongoDb();

    const objectIds = recordingIds.map(id => new ObjectId(id));

    // First, find the recordings to get their R2 keys
    const recordings = await db
        .collection<Recording>(Collections.RECORDINGS)
        .find({
            _id: { $in: objectIds },
            firebaseUid,
        })
        .toArray();

    // Then delete them
    await db.collection<Recording>(Collections.RECORDINGS).deleteMany({
        _id: { $in: objectIds },
        firebaseUid,
    });

    if (recordings.length > 0) {
        // Update user stats
        const totalDuration = recordings.reduce((sum, r) => sum + r.duration, 0);
        const { updateUserRecordingStats } = await import('./users');
        await updateUserRecordingStats(firebaseUid, {
            count: -recordings.length,
            duration: -totalDuration,
        });
    }

    return recordings;
}

/**
 * Get recordings with signed playback URLs.
 */
export async function getRecordingsWithUrls(
    firebaseUid: string,
    options?: {
        limit?: number;
        skip?: number;
        includeArchived?: boolean;
    }
): Promise<RecordingResponse[]> {
    const recordings = await getRecordingsByUser(firebaseUid, options);

    const recordingsWithUrls = await Promise.all(
        recordings.map(async (recording) => {
            const playbackUrl = await getSignedR2Url(recording.r2Key, 3600); // 1 hour expiry
            return toRecordingResponse(recording, playbackUrl);
        })
    );

    return recordingsWithUrls;
}

/**
 * Count recordings for a user.
 */
export async function countRecordingsByUser(firebaseUid: string): Promise<number> {
    const db = await getMongoDb();

    // Lazy migration: Check if user has totalRecordings count
    const { findUserByFirebaseUid, updateUser } = await import('./users');
    const user = await findUserByFirebaseUid(firebaseUid);

    if (user && typeof user.totalRecordings === 'number') {
        return user.totalRecordings;
    }

    // Fallback + Migration
    const count = await db.collection<Recording>(Collections.RECORDINGS).countDocuments({
        firebaseUid,
        isArchived: { $ne: true },
    });

    // Update user profile asynchronously
    updateUser(firebaseUid, { totalRecordings: count }).catch(err => {
        console.error('Failed to migrate totalRecordings count:', err);
    });

    return count;
}

/**
 * Get total duration of all recordings for a user.
 */
export async function getTotalDurationByUser(firebaseUid: string): Promise<number> {
    const db = await getMongoDb();

    // Lazy migration
    const { findUserByFirebaseUid, updateUser } = await import('./users');
    const user = await findUserByFirebaseUid(firebaseUid);

    if (user && typeof user.totalDuration === 'number') {
        return user.totalDuration;
    }

    // Fallback + Migration
    const result = await db.collection<Recording>(Collections.RECORDINGS).aggregate([
        { $match: { firebaseUid, isArchived: { $ne: true } } },
        { $group: { _id: null, totalDuration: { $sum: '$duration' } } },
    ]).toArray();

    const totalDuration = result[0]?.totalDuration || 0;

    updateUser(firebaseUid, { totalDuration }).catch(err => {
        console.error('Failed to migrate totalDuration:', err);
    });

    return totalDuration;
}

export type DashboardStats = {
    totalRecordings: number;
    newThisMonth: number;
    unknownCallers: number;
    avgDuration: number;
};

export async function getDashboardStats(firebaseUid: string): Promise<DashboardStats> {
    const db = await getMongoDb();
    const now = new Date();
    const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

    // Try to get cached stats first
    const { findUserByFirebaseUid, updateUser } = await import('./users');
    const user = await findUserByFirebaseUid(firebaseUid);

    // Check if we have both totals
    const hasCachedTotals = user &&
        typeof user.totalRecordings === 'number' &&
        typeof user.totalDuration === 'number';

    // If we have cached totals, we only need to query for newThisMonth and unknownCallers
    // Ideally we would optimize those too, but for now we'll stick to optimizing the heavy totals aggregation

    // Simplification: running the aggregation is still needed for newThisMonth/unknownCallers
    // But we can avoid the summation for totalDuration if we trust the cache, 
    // OR we can just run the aggregation for everything if cache is missing,
    // and if cache is present, we might still need to query for temporal stats (newThisMonth).

    // Strategy: 
    // If cache is missing, run full aggregation and update cache.
    // If cache is present, run a LIGHTER aggregation for just newThisMonth/unknownCallers, or stick to existing one?
    // The existing aggregation does everything in one pass. Splitting it might be more expensive if we still need to scan for month/unknown.
    // HOWEVER, typical dashboard load is: "Total Recs", "New this month", "Unknown callers", "Avg Duration".
    // "Total Recs" and "Avg Duration" (Total Duration / Total Recs) can come from User.
    // "New This Month" and "Unknown" need scan.

    // Let's use the full aggregation to get the definitive current state for migration/fallback,
    // but if we wanted to be super optimized we'd index other things.
    // Given the prompt "optimize similar inefficiencies", let's prioritize using the User stats if available 
    // and MAYBE doing a cheaper query for the rest? 
    // Actually, "New This Month" requires scanning `recordedAt`. "Unknown Callers" scans `contactName`.
    // We can't easily optimize those without new indices or counters.
    // BUT we can at least ensure `totalRecordings` and `totalDuration` are populated for future use (e.g. valid lazy migration).

    // Let's keep the aggregation but ALSO update the cache if it's missing or out of sync? 
    // No, that might be too much.
    // Let's stick to: If User has stats, use them for Total & Duration. Query ONLY for the others.

    let totalRecordings = 0;
    let totalDuration = 0;
    let newThisMonth = 0;
    let unknownCallers = 0;

    if (hasCachedTotals) {
        totalRecordings = user.totalRecordings!;
        totalDuration = user.totalDuration!;

        // We still need newThisMonth and unknownCallers. 
        // We can do two separate optimized count queries or one aggregation.
        // Let's do a single aggregation for the remaining fields to avoid scanning getting *everything* if possible?
        // Actually, just doing two counts is faster if indexed properly.
        // `recordedAt` is indexed? default sort is `recordedAt: -1`, so likely indexed.
        // `query.isArchived` is used.

        // Parallel queries for specific stats
        const [monthCount, unknownCount] = await Promise.all([
            db.collection<Recording>(Collections.RECORDINGS).countDocuments({
                firebaseUid,
                isArchived: { $ne: true },
                recordedAt: { $gte: oneMonthAgo }
            }),
            db.collection<Recording>(Collections.RECORDINGS).countDocuments({
                firebaseUid,
                isArchived: { $ne: true },
                $or: [{ contactName: { $exists: false } }, { contactName: null }]
            })
        ]);

        newThisMonth = monthCount;
        unknownCallers = unknownCount;

    } else {
        // Full Aggregation (Fallback + Migration)
        const result = await db.collection<Recording>(Collections.RECORDINGS).aggregate([
            { $match: { firebaseUid, isArchived: { $ne: true } } },
            {
                $group: {
                    _id: null,
                    totalRecordings: { $sum: 1 },
                    newThisMonth: {
                        $sum: {
                            $cond: [{ $gte: ['$recordedAt', oneMonthAgo] }, 1, 0]
                        }
                    },
                    unknownCallers: {
                        $sum: {
                            $cond: [{ $ifNull: ['$contactName', false] }, 0, 1]
                        }
                    },
                    totalDuration: { $sum: '$duration' }
                }
            }
        ]).toArray();

        const stats = result[0] || { totalRecordings: 0, newThisMonth: 0, unknownCallers: 0, totalDuration: 0 };

        totalRecordings = stats.totalRecordings;
        totalDuration = stats.totalDuration;
        newThisMonth = stats.newThisMonth;
        unknownCallers = stats.unknownCallers;

        // Lazy migration: Update user stats
        updateUser(firebaseUid, {
            totalRecordings,
            totalDuration
        }).catch(err => {
            console.error('Failed to migrate dashboard stats:', err);
        });
    }

    return {
        totalRecordings,
        newThisMonth,
        unknownCallers,
        avgDuration: totalRecordings > 0 ? Math.round(totalDuration / totalRecordings) : 0
    };
}

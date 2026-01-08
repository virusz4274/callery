import { ObjectId } from 'mongodb';
import { getMongoDb, Collections } from '@/lib/mongodb';
import type { Recording, CreateRecordingInput, UpdateRecordingInput, RecordingResponse } from './types';

import { toRecordingResponse } from './converters';



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
 * Get recordings for API response (without signed URLs).
 */
export async function getRecordingsForApi(
    firebaseUid: string,
    options?: {
        limit?: number;
        skip?: number;
        includeArchived?: boolean;
    }
): Promise<RecordingResponse[]> {
    const recordings = await getRecordingsByUser(firebaseUid, options);

    return recordings.map(recording => toRecordingResponse(recording));
}

/**
 * Count recordings for a user.
 */
export async function countRecordingsByUser(firebaseUid: string): Promise<number> {
    // We rely on the user profile to store the total count.
    const { findUserByFirebaseUid } = await import('./users');
    const user = await findUserByFirebaseUid(firebaseUid);

    return user?.totalRecordings || 0;
}

/**
 * Get total duration of all recordings for a user.
 */
export async function getTotalDurationByUser(firebaseUid: string): Promise<number> {
    // We rely on the user profile to store the total duration.
    const { findUserByFirebaseUid } = await import('./users');
    const user = await findUserByFirebaseUid(firebaseUid);

    return user?.totalDuration || 0;
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

    const { findUserByFirebaseUid } = await import('./users');
    const user = await findUserByFirebaseUid(firebaseUid);

    const totalRecordings = user?.totalRecordings || 0;
    const totalDuration = user?.totalDuration || 0;

    // Run specific queries for "New This Month" and "Unknown"
    // optimized to avoid full collection scan if possible (depends on indexes)
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

    const newThisMonth = monthCount;
    const unknownCallers = unknownCount;

    return {
        totalRecordings,
        newThisMonth,
        unknownCallers,
        avgDuration: totalRecordings > 0 ? Math.round(totalDuration / totalRecordings) : 0
    };
}

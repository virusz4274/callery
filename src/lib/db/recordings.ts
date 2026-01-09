import { ObjectId } from 'mongodb';
import { getMongoDb, Collections } from '@/lib/mongodb';
import type { Recording, CreateRecordingInput, UpdateRecordingInput, RecordingResponse } from './types';

import { toRecordingResponse } from './converters';



/**
 * Get all recordings for a user.
 */
/**
 * Get all recordings for a user.
 */
export async function getRecordingsByUser(
    firebaseUid: string,
    options?: {
        limit?: number;
        skip?: number;
        includeArchived?: boolean;
        contactName?: string;
        sortBy?: 'date' | 'duration';
        sortOrder?: 'asc' | 'desc';
        startDate?: string;
        endDate?: string;
    }
): Promise<Recording[]> {
    const db = await getMongoDb();

    const query: Record<string, unknown> = { firebaseUid };
    if (!options?.includeArchived) {
        query.isArchived = { $ne: true };
    }
    if (options?.contactName) {
        query.contactName = options.contactName;
    }

    if (options?.startDate || options?.endDate) {
        const dateQuery: Record<string, unknown> = {};
        // Ensure valid dates if provided
        if (options.startDate) {
            const start = new Date(options.startDate);
            if (!isNaN(start.getTime())) {
                dateQuery.$gte = start;
            }
        }
        if (options.endDate) {
            const end = new Date(options.endDate);
            if (!isNaN(end.getTime())) {
                // If it's just a date string (YYYY-MM-DD), we might want to set to end of day?
                // For now, assume the caller handles the specific time boundary or we accept strict comparison.
                // Let's ensure we cover the whole seconds/milliseconds of the end date if it matches the start date?
                // Actually, let's keep it simple: exact comparison.
                dateQuery.$lte = end;
            }
        }
        if (Object.keys(dateQuery).length > 0) {
            query.recordedAt = dateQuery;
        }
    }

    const sort: Record<string, 1 | -1> = {};
    if (options?.sortBy === 'duration') {
        sort.duration = options.sortOrder === 'asc' ? 1 : -1;
    } else {
        // Default to date
        // If sortOrder is explicitly 'asc', use 1, otherwise default to -1 (desc)
        sort.recordedAt = options?.sortOrder === 'asc' ? 1 : -1;
    }

    const recordings = await db
        .collection<Recording>(Collections.RECORDINGS)
        .find(query)
        .sort(sort)
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

    // Update contact stats if linked
    if (data.contactId) {
        const { incrementContactRecordings } = await import('./contacts');
        await incrementContactRecordings(data.contactId, data.firebaseUid, now, 1);
    }

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

        // Update contact stats if linked
        if (result.contactId) {
            const { incrementContactRecordings } = await import('./contacts');
            // We pass new Date() as recordingDate but since amount is -1 it won't be used to set lastRecordingAt
            await incrementContactRecordings(result.contactId, firebaseUid, new Date(), -1);
        }
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

        // Update contact stats for deleted recordings
        const { incrementContactRecordings } = await import('./contacts');

        // Group by contactId to optimize updates (though loop is fine for now)
        for (const recording of recordings) {
            if (recording.contactId) {
                // We pass new Date() as recordingDate but since amount is -1 it won't be used to set lastRecordingAt
                await incrementContactRecordings(recording.contactId, firebaseUid, new Date(), -1);
            }
        }
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
        contactName?: string;
        sortBy?: 'date' | 'duration';
        sortOrder?: 'asc' | 'desc';
        startDate?: string;
        endDate?: string;
    }
): Promise<RecordingResponse[]> {
    const recordings = await getRecordingsByUser(firebaseUid, options);

    return recordings.map(recording => toRecordingResponse(recording));
}

/**
 * Count recordings for a user.
 */
export async function countRecordingsByUser(
    firebaseUid: string,
    options?: {
        includeArchived?: boolean;
        contactName?: string;
        startDate?: string;
        endDate?: string;
    }
): Promise<number> {
    // If filtering, we must query the collection
    if (options?.contactName || options?.startDate || options?.endDate) {
        const db = await getMongoDb();
        const query: Record<string, unknown> = { firebaseUid };

        if (!options.includeArchived) {
            query.isArchived = { $ne: true };
        }

        if (options.contactName) {
            query.contactName = options.contactName;
        }

        if (options.startDate || options.endDate) {
            const dateQuery: Record<string, unknown> = {};
            if (options.startDate) {
                const start = new Date(options.startDate);
                if (!isNaN(start.getTime())) dateQuery.$gte = start;
            }
            if (options.endDate) {
                const end = new Date(options.endDate);
                if (!isNaN(end.getTime())) dateQuery.$lte = end;
            }
            if (Object.keys(dateQuery).length > 0) {
                query.recordedAt = dateQuery;
            }
        }

        return db.collection(Collections.RECORDINGS).countDocuments(query);
    }

    // Default optimization: use user profile stats
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

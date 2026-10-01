import { ObjectId } from 'mongodb';
import { getMongoDb, Collections } from '@/lib/mongodb';
import type { Recording, CreateRecordingInput, UpdateRecordingInput, RecordingResponse } from './types';

import { toRecordingResponse } from './converters';

export interface RecordingsQueryOptions {
    limit?: number;
    skip?: number;
    includeArchived?: boolean;
    contactName?: string;
    sortBy?: 'date' | 'duration';
    sortOrder?: 'asc' | 'desc';
    startDate?: string;
    endDate?: string;
    /** Keyword search across contact, phone, file name, summary, and tags. */
    search?: string;
}

/** Escape user input so it is treated literally inside a RegExp. */
export function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalize an end-date boundary. A bare `YYYY-MM-DD` date means the whole
 * day, so it is extended to 23:59:59.999; full timestamps pass through.
 */
export function normalizeEndDate(value: string): Date | null {
    const end = new Date(value);
    if (isNaN(end.getTime())) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
        end.setHours(23, 59, 59, 999);
    }
    return end;
}

/**
 * Build the shared MongoDB filter for recordings. Used by both the list
 * query and the count query so pagination totals always match the rows.
 */
export function buildRecordingsQuery(
    authSubject: string,
    options?: Pick<RecordingsQueryOptions, 'includeArchived' | 'contactName' | 'startDate' | 'endDate' | 'search'>
): Record<string, unknown> {
    const query: Record<string, unknown> = { authSubject };
    if (!options?.includeArchived) {
        query.isArchived = { $ne: true };
    }
    if (options?.contactName) {
        if (options.contactName === 'Unknown') {
            query.$or = [{ contactName: null }, { contactName: { $exists: false } }];
        } else {
            query.contactName = options.contactName;
        }
    }

    if (options?.startDate || options?.endDate) {
        const dateQuery: Record<string, unknown> = {};
        if (options.startDate) {
            const start = new Date(options.startDate);
            if (!isNaN(start.getTime())) {
                dateQuery.$gte = start;
            }
        }
        if (options.endDate) {
            const end = normalizeEndDate(options.endDate);
            if (end) {
                dateQuery.$lte = end;
            }
        }
        if (Object.keys(dateQuery).length > 0) {
            query.recordedAt = dateQuery;
        }
    }

    const search = options?.search?.trim();
    if (search) {
        const regex = { $regex: escapeRegExp(search), $options: 'i' };
        const searchOr: Record<string, unknown>[] = [
            { contactName: regex },
            { phoneNumber: regex },
            { fileName: regex },
            { standardizedDisplayName: regex },
            { summary: regex },
            { tags: regex },
            { 'fullTranscript.text': regex },
        ];
        if (query.$or) {
            // Both contact-Unknown and search $or clauses: combine with $and.
            const existing = query.$or;
            delete query.$or;
            query.$and = [{ $or: existing }, { $or: searchOr }];
        } else {
            query.$or = searchOr;
        }
    }

    return query;
}

/**
 * Get all recordings for a user.
 */
export async function getRecordingsByUser(
    authSubject: string,
    options?: RecordingsQueryOptions
): Promise<Recording[]> {
    const db = await getMongoDb();

    const query = buildRecordingsQuery(authSubject, options);

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
    authSubject: string
): Promise<Recording | null> {
    const db = await getMongoDb();

    return db.collection<Recording>(Collections.RECORDINGS).findOne({
        _id: new ObjectId(recordingId),
        authSubject,
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
    await updateUserRecordingStats(data.authSubject, {
        count: 1,
        duration: data.duration,
    });

    // Update contact stats if linked
    if (data.contactId) {
        const { incrementContactRecordings } = await import('./contacts');
        await incrementContactRecordings(data.contactId.toString(), data.authSubject, now, 1);
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
    authSubject: string,
    data: UpdateRecordingInput
): Promise<Recording | null> {
    const db = await getMongoDb();

    const result = await db.collection<Recording>(Collections.RECORDINGS).findOneAndUpdate(
        { _id: new ObjectId(recordingId), authSubject },
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
    authSubject: string
): Promise<Recording | null> {
    const db = await getMongoDb();

    const result = await db.collection<Recording>(Collections.RECORDINGS).findOneAndDelete({
        _id: new ObjectId(recordingId),
        authSubject,
    });

    if (result) {
        // Update user stats
        const { updateUserRecordingStats } = await import('./users');
        await updateUserRecordingStats(authSubject, {
            count: -1,
            duration: -result.duration,
        });

        // Update contact stats if linked
        if (result.contactId) {
            const { incrementContactRecordings } = await import('./contacts');
            // We pass new Date() as recordingDate but since amount is -1 it won't be used to set lastRecordingAt
            await incrementContactRecordings(result.contactId.toString(), authSubject, new Date(), -1);
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
    authSubject: string
): Promise<Recording[]> {
    const db = await getMongoDb();

    const objectIds = recordingIds.map(id => new ObjectId(id));

    // First, find the recordings to get their R2 keys
    const recordings = await db
        .collection<Recording>(Collections.RECORDINGS)
        .find({
            _id: { $in: objectIds },
            authSubject,
        })
        .toArray();

    // Then delete them
    await db.collection<Recording>(Collections.RECORDINGS).deleteMany({
        _id: { $in: objectIds },
        authSubject,
    });

    if (recordings.length > 0) {
        // Update user stats
        const totalDuration = recordings.reduce((sum, r) => sum + r.duration, 0);
        const { updateUserRecordingStats } = await import('./users');
        await updateUserRecordingStats(authSubject, {
            count: -recordings.length,
            duration: -totalDuration,
        });

        // Update contact stats for deleted recordings
        const { incrementContactRecordings } = await import('./contacts');

        // Group by contactId to optimize updates (though loop is fine for now)
        for (const recording of recordings) {
            if (recording.contactId) {
                // We pass new Date() as recordingDate but since amount is -1 it won't be used to set lastRecordingAt
                await incrementContactRecordings(recording.contactId.toString(), authSubject, new Date(), -1);
            }
        }
    }

    return recordings;
}

/**
 * Get recordings for API response (without signed URLs).
 */
export async function getRecordingsForApi(
    authSubject: string,
    options?: RecordingsQueryOptions
): Promise<RecordingResponse[]> {
    const recordings = await getRecordingsByUser(authSubject, options);

    return recordings.map(recording => toRecordingResponse(recording));
}

/**
 * Count recordings for a user.
 */
export async function countRecordingsByUser(
    authSubject: string,
    options?: Pick<RecordingsQueryOptions, 'includeArchived' | 'contactName' | 'startDate' | 'endDate' | 'search'>
): Promise<number> {
    // If filtering, we must query the collection
    if (options?.contactName || options?.startDate || options?.endDate || options?.search) {
        const db = await getMongoDb();
        const query = buildRecordingsQuery(authSubject, options);
        return db.collection(Collections.RECORDINGS).countDocuments(query);
    }

    // Default optimization: use user profile stats
    const { findUserByAuthSubject } = await import('./users');
    const user = await findUserByAuthSubject(authSubject);

    return user?.totalRecordings || 0;
}

/**
 * Get total duration of all recordings for a user.
 */
export async function getTotalDurationByUser(authSubject: string): Promise<number> {
    // We rely on the user profile to store the total duration.
    const { findUserByAuthSubject } = await import('./users');
    const user = await findUserByAuthSubject(authSubject);

    return user?.totalDuration || 0;
}

export type DashboardStats = {
    totalRecordings: number;
    newThisMonth: number;
    unknownCallers: number;
    avgDuration: number;
};

export async function getDashboardStats(authSubject: string): Promise<DashboardStats> {
    const db = await getMongoDb();
    const now = new Date();
    const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

    const { findUserByAuthSubject } = await import('./users');
    const user = await findUserByAuthSubject(authSubject);

    const totalRecordings = user?.totalRecordings || 0;
    const totalDuration = user?.totalDuration || 0;

    // Run specific queries for "New This Month" and "Unknown"
    // optimized to avoid full collection scan if possible (depends on indexes)
    const [monthCount, unknownCount] = await Promise.all([
        db.collection<Recording>(Collections.RECORDINGS).countDocuments({
            authSubject,
            isArchived: { $ne: true },
            recordedAt: { $gte: oneMonthAgo }
        }),
        db.collection<Recording>(Collections.RECORDINGS).countDocuments({
            authSubject,
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

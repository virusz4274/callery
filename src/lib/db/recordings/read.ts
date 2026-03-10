import { ObjectId } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { toRecordingResponse } from '../converters';
import { findUserByFirebaseUid } from '../users';
import type { Recording, RecordingResponse } from '../types';
import { buildRecordingsQuery, buildRecordingsSort } from './query-utils';
import type { RecordingCountOptions, RecordingExportCursor, RecordingQueryOptions } from './types';

/**
 * Get all recordings for a user.
 */
export async function getRecordingsByUser(
    firebaseUid: string,
    options?: RecordingQueryOptions
): Promise<Recording[]> {
    const db = await getMongoDb();

    return db
        .collection<Recording>(Collections.RECORDINGS)
        .find(buildRecordingsQuery(firebaseUid, options))
        .sort(buildRecordingsSort(options))
        .skip(options?.skip || 0)
        .limit(options?.limit || 100)
        .toArray();
}

/**
 * Get a deterministic page of recordings for export processing.
 * Uses a cursor to avoid skip/limit scalability issues on large datasets.
 */
export async function getRecordingsPageForExport(
    firebaseUid: string,
    limit: number,
    cursor?: RecordingExportCursor
): Promise<Recording[]> {
    const db = await getMongoDb();
    const query: Record<string, unknown> = { firebaseUid };

    if (cursor) {
        query.$or = [
            { recordedAt: { $gt: cursor.recordedAt } },
            {
                recordedAt: cursor.recordedAt,
                _id: { $gt: new ObjectId(cursor.id) },
            },
        ];
    }

    return db
        .collection<Recording>(Collections.RECORDINGS)
        .find(query)
        .sort({ recordedAt: 1, _id: 1 })
        .limit(limit)
        .toArray();
}

/**
 * Count all recordings for export, including archived entries.
 */
export async function countRecordingsForExport(firebaseUid: string): Promise<number> {
    const db = await getMongoDb();
    return db.collection<Recording>(Collections.RECORDINGS).countDocuments({ firebaseUid });
}

/**
 * Get a single recording by ID.
 */
export async function getRecordingById(recordingId: string, firebaseUid: string): Promise<Recording | null> {
    const db = await getMongoDb();

    return db.collection<Recording>(Collections.RECORDINGS).findOne({
        _id: new ObjectId(recordingId),
        firebaseUid,
    });
}

/**
 * Get recordings for API response (without signed URLs).
 */
export async function getRecordingsForApi(
    firebaseUid: string,
    options?: RecordingQueryOptions
): Promise<RecordingResponse[]> {
    const recordings = await getRecordingsByUser(firebaseUid, options);
    return recordings.map((recording) => toRecordingResponse(recording));
}

/**
 * Count recordings for a user.
 */
export async function countRecordingsByUser(
    firebaseUid: string,
    options?: RecordingCountOptions
): Promise<number> {
    if (options?.search || options?.contactName || options?.contactId || options?.startDate || options?.endDate) {
        const db = await getMongoDb();
        return db.collection(Collections.RECORDINGS).countDocuments(buildRecordingsQuery(firebaseUid, options));
    }

    const user = await findUserByFirebaseUid(firebaseUid);
    return user?.totalRecordings || 0;
}

/**
 * Get total duration of all recordings for a user.
 */
export async function getTotalDurationByUser(firebaseUid: string): Promise<number> {
    const user = await findUserByFirebaseUid(firebaseUid);
    return user?.totalDuration || 0;
}

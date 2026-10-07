import { ObjectId } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { toRecordingResponse } from '../converters';
import { findUserByAuthSubject } from '../users';
import type { Recording, RecordingResponse } from '../types';
import { hydrateRecordingContacts } from './hydrate-contacts';
import { buildRecordingsQuery, buildRecordingsSort } from './query-utils';
import type { RecordingCountOptions, RecordingExportCursor, RecordingQueryOptions } from './types';

/**
 * Get all recordings for a user.
 */
export async function getRecordingsByUser(
    authSubject: string,
    options?: RecordingQueryOptions
): Promise<Recording[]> {
    const db = await getMongoDb();

    const recordings = await db
        .collection<Recording>(Collections.RECORDINGS)
        .find(buildRecordingsQuery(authSubject, options))
        .sort(buildRecordingsSort(options))
        .skip(options?.skip || 0)
        .limit(options?.limit || 100)
        .toArray();
    return hydrateRecordingContacts(authSubject, recordings);
}

/**
 * Get a deterministic page of recordings for export processing.
 * Uses a cursor to avoid skip/limit scalability issues on large datasets.
 */
export async function getRecordingsPageForExport(
    authSubject: string,
    limit: number,
    cursor?: RecordingExportCursor
): Promise<Recording[]> {
    const db = await getMongoDb();
    const query: Record<string, unknown> = { authSubject };

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
export async function countRecordingsForExport(authSubject: string): Promise<number> {
    const db = await getMongoDb();
    return db.collection<Recording>(Collections.RECORDINGS).countDocuments({ authSubject });
}

/**
 * Get a single recording by ID.
 */
export async function getRecordingById(recordingId: string, authSubject: string): Promise<Recording | null> {
    const db = await getMongoDb();

    const recording = await db.collection<Recording>(Collections.RECORDINGS).findOne({
        _id: new ObjectId(recordingId),
        authSubject,
    });
    return recording ? (await hydrateRecordingContacts(authSubject, [recording]))[0] : null;
}

/**
 * Get a single recording by its R2 key.
 */
export async function getRecordingByR2Key(authSubject: string, r2Key: string): Promise<Recording | null> {
    const db = await getMongoDb();

    return db.collection<Recording>(Collections.RECORDINGS).findOne({
        authSubject,
        r2Key,
    });
}

/**
 * Get multiple recordings by ID for a specific user.
 */
export async function getRecordingsByIds(recordingIds: string[], authSubject: string): Promise<Recording[]> {
    const objectIds = recordingIds
        .filter((recordingId) => ObjectId.isValid(recordingId))
        .map((recordingId) => new ObjectId(recordingId));

    if (objectIds.length === 0) {
        return [];
    }

    const db = await getMongoDb();
    const recordings = await db.collection<Recording>(Collections.RECORDINGS).find({
        _id: { $in: objectIds },
        authSubject,
    }).toArray();
    return hydrateRecordingContacts(authSubject, recordings);
}

/**
 * Get recordings for API response (without signed URLs).
 */
export async function getRecordingsForApi(
    authSubject: string,
    options?: RecordingQueryOptions
): Promise<RecordingResponse[]> {
    const recordings = await getRecordingsByUser(authSubject, options);
    return recordings.map((recording) => toRecordingResponse(recording));
}

/**
 * Count recordings for a user.
 */
export async function countRecordingsByUser(
    authSubject: string,
    options?: RecordingCountOptions
): Promise<number> {
    const db = await getMongoDb();
    return db.collection(Collections.RECORDINGS).countDocuments(buildRecordingsQuery(authSubject, options));
}

/**
 * Get total duration of all recordings for a user.
 */
export async function getTotalDurationByUser(authSubject: string): Promise<number> {
    const user = await findUserByAuthSubject(authSubject);
    return user?.totalDuration || 0;
}

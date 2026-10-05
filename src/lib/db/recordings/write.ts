import { ObjectId } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { incrementContactRecordings } from '../contacts';
import { normalizeContactPhoneNumber } from '../contacts/normalize';
import type { CreateRecordingInput, Recording, UpdateRecordingInput } from '../types';
import { updateUserRecordingStats } from '../users';

export function buildRecordingWriteData(data: CreateRecordingInput, timestamp: Date): Omit<Recording, '_id'> {
    return {
        ...data,
        normalizedPhoneNumber: normalizeContactPhoneNumber(data.phoneNumber),
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}

/**
 * Create a new recording.
 */
export async function createRecording(data: CreateRecordingInput): Promise<Recording> {
    const db = await getMongoDb();
    const now = new Date();
    const recordingDoc = buildRecordingWriteData(data, now);

    const result = await db.collection<Recording>(Collections.RECORDINGS).insertOne(recordingDoc as Recording);

    await updateUserRecordingStats(data.authSubject, {
        count: 1,
        duration: data.duration,
    });

    if (data.contactId) {
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
    const updateData: Record<string, unknown> = {
        ...data,
        updatedAt: new Date(),
    };

    if (typeof data.phoneNumber === 'string') {
        updateData.normalizedPhoneNumber = normalizeContactPhoneNumber(data.phoneNumber);
    }

    return db.collection<Recording>(Collections.RECORDINGS).findOneAndUpdate(
        { _id: new ObjectId(recordingId), authSubject },
        {
            $set: updateData,
        },
        { returnDocument: 'after' }
    );
}

/**
 * Mark transcription usage as reported for a specific processing run.
 * Returns true only on the first successful mark for a given report ID.
 */
export async function markTranscriptionUsageReported(
    recordingId: string,
    authSubject: string,
    reportId: string
): Promise<boolean> {
    const db = await getMongoDb();

    const result = await db.collection<Recording>(Collections.RECORDINGS).updateOne(
        {
            _id: new ObjectId(recordingId),
            authSubject,
            transcriptionUsageReportId: { $ne: reportId },
        },
        {
            $set: {
                transcriptionUsageReportId: reportId,
                transcriptionUsageReportedAt: new Date(),
                updatedAt: new Date(),
            },
        }
    );

    return result.modifiedCount > 0;
}

/**
 * Delete a recording by ID.
 * Note: This only deletes from MongoDB. R2 deletion should be handled separately.
 */
export async function deleteRecording(recordingId: string, authSubject: string): Promise<Recording | null> {
    const db = await getMongoDb();

    const result = await db.collection<Recording>(Collections.RECORDINGS).findOneAndDelete({
        _id: new ObjectId(recordingId),
        authSubject,
    });

    if (result) {
        await updateUserRecordingStats(authSubject, {
            count: -1,
            duration: -result.duration,
        });

        if (result.contactId) {
            await incrementContactRecordings(result.contactId.toString(), authSubject, new Date(), -1);
        }
    }

    return result;
}

/**
 * Delete multiple recordings by IDs.
 * Returns the deleted recordings for R2 cleanup.
 */
export async function deleteRecordings(recordingIds: string[], authSubject: string): Promise<Recording[]> {
    const db = await getMongoDb();
    const objectIds = recordingIds.map((id) => new ObjectId(id));

    const recordings = await db
        .collection<Recording>(Collections.RECORDINGS)
        .find({
            _id: { $in: objectIds },
            authSubject,
        })
        .toArray();

    await db.collection<Recording>(Collections.RECORDINGS).deleteMany({
        _id: { $in: objectIds },
        authSubject,
    });

    if (recordings.length > 0) {
        const totalDuration = recordings.reduce((sum, recording) => sum + recording.duration, 0);
        await updateUserRecordingStats(authSubject, {
            count: -recordings.length,
            duration: -totalDuration,
        });

        for (const recording of recordings) {
            if (recording.contactId) {
                await incrementContactRecordings(recording.contactId.toString(), authSubject, new Date(), -1);
            }
        }
    }

    return recordings;
}

export async function claimRecordingForTranscription(id: string, subject: string, metadata: UpdateRecordingInput): Promise<boolean> {
    const db = await getMongoDb();
    const result = await db.collection<Recording>(Collections.RECORDINGS).updateOne(
        { _id: new ObjectId(id), authSubject: subject, transcriptionStatus: { $ne: 'processing' } },
        { $set: { ...metadata, transcriptionStatus: 'processing', updatedAt: new Date() } },
    );
    return result.modifiedCount > 0;
}

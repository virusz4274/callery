import { ObjectId } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { incrementContactRecordings } from '../contacts';
import type { CreateRecordingInput, Recording, UpdateRecordingInput } from '../types';
import { updateUserRecordingStats } from '../users';

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

    const result = await db.collection<Recording>(Collections.RECORDINGS).insertOne(recordingDoc as Recording);

    await updateUserRecordingStats(data.firebaseUid, {
        count: 1,
        duration: data.duration,
    });

    if (data.contactId) {
        await incrementContactRecordings(data.contactId.toString(), data.firebaseUid, now, 1);
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

    return db.collection<Recording>(Collections.RECORDINGS).findOneAndUpdate(
        { _id: new ObjectId(recordingId), firebaseUid },
        {
            $set: {
                ...data,
                updatedAt: new Date(),
            },
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
    firebaseUid: string,
    reportId: string
): Promise<boolean> {
    const db = await getMongoDb();

    const result = await db.collection<Recording>(Collections.RECORDINGS).updateOne(
        {
            _id: new ObjectId(recordingId),
            firebaseUid,
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
export async function deleteRecording(recordingId: string, firebaseUid: string): Promise<Recording | null> {
    const db = await getMongoDb();

    const result = await db.collection<Recording>(Collections.RECORDINGS).findOneAndDelete({
        _id: new ObjectId(recordingId),
        firebaseUid,
    });

    if (result) {
        await updateUserRecordingStats(firebaseUid, {
            count: -1,
            duration: -result.duration,
        });

        if (result.contactId) {
            await incrementContactRecordings(result.contactId.toString(), firebaseUid, new Date(), -1);
        }
    }

    return result;
}

/**
 * Delete multiple recordings by IDs.
 * Returns the deleted recordings for R2 cleanup.
 */
export async function deleteRecordings(recordingIds: string[], firebaseUid: string): Promise<Recording[]> {
    const db = await getMongoDb();
    const objectIds = recordingIds.map((id) => new ObjectId(id));

    const recordings = await db
        .collection<Recording>(Collections.RECORDINGS)
        .find({
            _id: { $in: objectIds },
            firebaseUid,
        })
        .toArray();

    await db.collection<Recording>(Collections.RECORDINGS).deleteMany({
        _id: { $in: objectIds },
        firebaseUid,
    });

    if (recordings.length > 0) {
        const totalDuration = recordings.reduce((sum, recording) => sum + recording.duration, 0);
        await updateUserRecordingStats(firebaseUid, {
            count: -recordings.length,
            duration: -totalDuration,
        });

        for (const recording of recordings) {
            if (recording.contactId) {
                await incrementContactRecordings(recording.contactId.toString(), firebaseUid, new Date(), -1);
            }
        }
    }

    return recordings;
}

import { ObjectId } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { Contact } from '../types';

export async function recalculateContactStats(
    contactId: string | ObjectId,
    authSubject: string
): Promise<{ totalRecordings: number; lastRecordingAt: Date | null }> {
    const db = await getMongoDb();
    const cId = new ObjectId(contactId);

    const stats = await db
        .collection(Collections.RECORDINGS)
        .aggregate([
            {
                $match: {
                    authSubject,
                    contactId: cId,
                },
            },
            {
                $group: {
                    _id: null,
                    count: { $sum: 1 },
                    lastRecording: { $max: '$recordedAt' },
                },
            },
        ])
        .toArray();

    const count = stats[0]?.count || 0;
    const lastRecording = stats[0]?.lastRecording || null;

    await db.collection<Contact>(Collections.CONTACTS).updateOne(
        { _id: cId, authSubject },
        {
            $set: {
                totalRecordings: count,
                lastRecordingAt: lastRecording,
                updatedAt: new Date(),
            },
        }
    );

    return { totalRecordings: count, lastRecordingAt: lastRecording };
}

/**
 * Increment the recording count for a contact.
 */
export async function incrementContactRecordings(
    contactId: string,
    authSubject: string,
    recordingDate: Date,
    amount: number = 1
): Promise<void> {
    const db = await getMongoDb();

    const update: Record<string, unknown> = {
        $inc: { totalRecordings: amount },
        $set: {
            updatedAt: new Date(),
        },
    };

    if (amount > 0) {
        update.$max = { lastRecordingAt: recordingDate };
    }

    await db.collection<Contact>(Collections.CONTACTS).updateOne(
        { _id: new ObjectId(contactId), authSubject },
        update
    );

    if (amount < 0) {
        await recalculateContactStats(contactId, authSubject);
    }
}

import { ObjectId } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { Contact } from '../types';

export async function recalculateContactStats(
    contactId: string | ObjectId,
    firebaseUid: string
): Promise<{ totalRecordings: number; lastRecordingAt: Date | null }> {
    const db = await getMongoDb();
    const cId = new ObjectId(contactId);

    const stats = await db
        .collection(Collections.RECORDINGS)
        .aggregate([
            {
                $match: {
                    firebaseUid,
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
        { _id: cId, firebaseUid },
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
    firebaseUid: string,
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
        (update.$set as Record<string, unknown>).lastRecordingAt = recordingDate;
    }

    await db.collection<Contact>(Collections.CONTACTS).updateOne(
        { _id: new ObjectId(contactId), firebaseUid },
        update
    );

    if (amount < 0) {
        await recalculateContactStats(contactId, firebaseUid);
    }
}

/**
 * Link existing recordings to a contact based on phone numbers.
 * Recalculates and returns total recording count and last recording date.
 */
export async function linkRecordingsToContact(
    contactId: string | ObjectId,
    phoneNumbers: string[],
    firebaseUid: string
): Promise<{ totalRecordings: number; lastRecordingAt: Date | null }> {
    const db = await getMongoDb();
    const cId = new ObjectId(contactId);

    if (!phoneNumbers || phoneNumbers.length === 0) {
        return { totalRecordings: 0, lastRecordingAt: null };
    }

    await db.collection(Collections.RECORDINGS).updateMany(
        {
            firebaseUid,
            phoneNumber: { $in: phoneNumbers },
            contactId: { $ne: cId },
        },
        {
            $set: {
                contactId: cId,
                contactName: (await db.collection<Contact>(Collections.CONTACTS).findOne({ _id: cId }))?.name,
            },
        }
    );

    return recalculateContactStats(cId, firebaseUid);
}

import { Collections, getMongoDb } from '@/lib/mongodb';
import { incrementContactCount } from '../../users';
import type { Contact, CreateContactInput } from '../../types';
import { linkRecordingsToContact } from '../link';

/**
 * Create a new contact.
 * If a contact with the same phone number exists, it is merged.
 */
export async function createContact(data: CreateContactInput): Promise<Contact> {
    const db = await getMongoDb();
    const now = new Date();

    if (data.phoneNumbers && data.phoneNumbers.length > 0) {
        const existing = await db.collection<Contact>(Collections.CONTACTS).findOne({
            firebaseUid: data.firebaseUid,
            phoneNumbers: { $in: data.phoneNumbers },
        });

        if (existing) {
            const updateData: Record<string, unknown> = { updatedAt: now };
            if (data.name) updateData.name = data.name;
            if (data.email) updateData.email = data.email;
            if (data.jobTitle) updateData.jobTitle = data.jobTitle;
            if (data.company) updateData.company = data.company;

            const result = await db.collection<Contact>(Collections.CONTACTS).findOneAndUpdate(
                { _id: existing._id },
                {
                    $set: updateData,
                    $addToSet: { phoneNumbers: { $each: data.phoneNumbers } },
                },
                { returnDocument: 'after' }
            );

            return result as Contact;
        }
    }

    const contactDoc = {
        ...data,
        createdAt: now,
        updatedAt: now,
    };

    const result = await db.collection<Contact>(Collections.CONTACTS).insertOne(contactDoc as Contact);
    await incrementContactCount(data.firebaseUid, 1);

    let stats: { totalRecordings: number; lastRecordingAt: Date | null } = {
        totalRecordings: 0,
        lastRecordingAt: null,
    };

    if (data.phoneNumbers && data.phoneNumbers.length > 0) {
        stats = await linkRecordingsToContact(result.insertedId, data.phoneNumbers, data.firebaseUid);
    }

    return {
        ...contactDoc,
        _id: result.insertedId,
        ...stats,
    } as Contact;
}

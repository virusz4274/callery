import { ObjectId } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { Contact, UpdateContactInput } from '../../types';

/**
 * Update an existing contact.
 */
export async function updateContact(
    contactId: string,
    firebaseUid: string,
    data: UpdateContactInput
): Promise<Contact | null> {
    const db = await getMongoDb();

    return db.collection<Contact>(Collections.CONTACTS).findOneAndUpdate(
        { _id: new ObjectId(contactId), firebaseUid },
        {
            $set: {
                ...data,
                updatedAt: new Date(),
            },
        },
        { returnDocument: 'after' }
    );
}

import { Collections, getMongoDb } from '@/lib/mongodb';
import { findUserByFirebaseUid } from '../users';
import type { Contact } from '../types';

/**
 * Get all contacts for a user.
 */
export async function getContactsByUser(
    firebaseUid: string,
    options?: {
        limit?: number;
        skip?: number;
    }
): Promise<Contact[]> {
    const db = await getMongoDb();

    return db
        .collection<Contact>(Collections.CONTACTS)
        .find({ firebaseUid })
        .collation({ locale: 'en', strength: 2 })
        .sort({ name: 1 })
        .skip(options?.skip || 0)
        .limit(options?.limit || 0)
        .toArray();
}

/**
 * Find a contact by phone number for a specific user.
 */
export async function findContactByPhone(firebaseUid: string, phoneNumber: string): Promise<Contact | null> {
    const db = await getMongoDb();

    return db.collection<Contact>(Collections.CONTACTS).findOne({
        firebaseUid,
        phoneNumbers: phoneNumber,
    });
}

/**
 * Find a contact by name for a specific user.
 */
export async function findContactByName(firebaseUid: string, name: string): Promise<Contact | null> {
    const db = await getMongoDb();

    return db.collection<Contact>(Collections.CONTACTS).findOne(
        {
            firebaseUid,
            name,
        },
        { collation: { locale: 'en', strength: 2 } }
    );
}

/**
 * Count all contacts for a user.
 */
export async function countContactsByUser(firebaseUid: string): Promise<number> {
    const user = await findUserByFirebaseUid(firebaseUid);
    return user?.totalContacts || 0;
}

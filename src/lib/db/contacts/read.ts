import { Collections, getMongoDb } from '@/lib/mongodb';
import type { Contact } from '../types';
import { normalizeContactName, normalizeContactPhoneNumber } from './normalize';

function buildGoogleContactQuery(authSubject: string) {
    return {
        authSubject,
        googleContactId: { $type: 'string' as const },
    };
}

/**
 * Get all contacts for a user.
 */
export async function getContactsByUser(
    authSubject: string,
    options?: {
        limit?: number;
        skip?: number;
    }
): Promise<Contact[]> {
    const db = await getMongoDb();

    return db
        .collection<Contact>(Collections.CONTACTS)
        .find(buildGoogleContactQuery(authSubject))
        .sort({ normalizedName: 1, name: 1 })
        .skip(options?.skip || 0)
        .limit(options?.limit || 0)
        .toArray();
}

/**
 * Find a contact by phone number for a specific user.
 */
export async function findContactByPhone(authSubject: string, phoneNumber: string): Promise<Contact | null> {
    const db = await getMongoDb();
    const normalizedPhoneNumber = normalizeContactPhoneNumber(phoneNumber);

    if (!normalizedPhoneNumber) {
        return null;
    }

    const matches = await db.collection<Contact>(Collections.CONTACTS)
        .find({
            ...buildGoogleContactQuery(authSubject),
            normalizedPhoneNumbers: normalizedPhoneNumber,
        })
        .limit(2)
        .toArray();

    return matches.length === 1 ? matches[0] : null;
}

/**
 * Find a contact by name for a specific user.
 */
export async function findContactByName(authSubject: string, name: string): Promise<Contact | null> {
    const db = await getMongoDb();
    const normalizedName = normalizeContactName(name);

    if (!normalizedName) {
        return null;
    }

    const matches = await db.collection<Contact>(Collections.CONTACTS)
        .find({
            ...buildGoogleContactQuery(authSubject),
            normalizedName,
        })
        .limit(2)
        .toArray();

    return matches.length === 1 ? matches[0] : null;
}

/**
 * Count all contacts for a user.
 */
export async function countContactsByUser(authSubject: string): Promise<number> {
    const db = await getMongoDb();

    return db.collection<Contact>(Collections.CONTACTS).countDocuments(buildGoogleContactQuery(authSubject));
}

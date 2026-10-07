import { ObjectId } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { Contact } from '../types';
import { normalizeContactName, normalizeContactPhoneNumber } from './normalize';
import { buildContactSearchFilter } from './search';

export async function findContactById(authSubject: string, contactId: string): Promise<Contact | null> {
    if (!ObjectId.isValid(contactId)) return null;
    const db = await getMongoDb();
    return db.collection<Contact>(Collections.CONTACTS).findOne({ _id: new ObjectId(contactId), authSubject });
}

/**
 * Get all contacts for a user.
 */
export async function getContactsByUser(
    authSubject: string,
    options?: {
        limit?: number;
        skip?: number;
        search?: string;
    }
): Promise<Contact[]> {
    const db = await getMongoDb();

    return db
        .collection<Contact>(Collections.CONTACTS)
        .find(buildContactSearchFilter(authSubject, options?.search))
        .sort({ normalizedName: 1, name: 1, _id: 1 })
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
            authSubject,
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
            authSubject,
            normalizedName,
        })
        .limit(2)
        .toArray();

    return matches.length === 1 ? matches[0] : null;
}

/**
 * Count all contacts for a user.
 */
export async function countContactsByUser(authSubject: string, search?: string): Promise<number> {
    const db = await getMongoDb();

    return db.collection<Contact>(Collections.CONTACTS).countDocuments(buildContactSearchFilter(authSubject, search));
}

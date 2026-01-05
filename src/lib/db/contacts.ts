import { getMongoDb, Collections } from '@/lib/mongodb';
import type { Contact, CreateContactInput, UpdateContactInput } from './types';

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

    const contacts = await db
        .collection<Contact>(Collections.CONTACTS)
        .find({ firebaseUid })
        .sort({ name: 1 })
        .skip(options?.skip || 0)
        .limit(options?.limit || 0) // 0 means no limit
        .toArray();

    return contacts;
}

/**
 * Find a contact by phone number for a specific user.
 */
export async function findContactByPhone(
    firebaseUid: string,
    phoneNumber: string
): Promise<Contact | null> {
    const db = await getMongoDb();

    return db.collection<Contact>(Collections.CONTACTS).findOne({
        firebaseUid,
        phoneNumbers: phoneNumber,
    });
}

/**
 * Find a contact by name for a specific user.
 */
export async function findContactByName(
    firebaseUid: string,
    name: string
): Promise<Contact | null> {
    const db = await getMongoDb();

    return db.collection<Contact>(Collections.CONTACTS).findOne({
        firebaseUid,
        name,
    });
}

/**
 * Create a new contact.
 */
export async function createContact(data: CreateContactInput): Promise<Contact> {
    const db = await getMongoDb();
    const now = new Date();

    const contactDoc = {
        ...data,
        createdAt: now,
        updatedAt: now,
    };

    const result = await db.collection<Contact>(Collections.CONTACTS).insertOne(contactDoc as Contact);

    // Increment user's contact count
    const { incrementContactCount } = await import('./users');
    await incrementContactCount(data.firebaseUid, 1);

    return {
        ...contactDoc,
        _id: result.insertedId,
    } as Contact;
}

/**
 * Update an existing contact.
 */
export async function updateContact(
    contactId: string,
    firebaseUid: string,
    data: UpdateContactInput
): Promise<Contact | null> {
    const db = await getMongoDb();
    const { ObjectId } = await import('mongodb');

    const result = await db.collection<Contact>(Collections.CONTACTS).findOneAndUpdate(
        { _id: new ObjectId(contactId), firebaseUid },
        {
            $set: {
                ...data,
                updatedAt: new Date(),
            }
        },
        { returnDocument: 'after' }
    );

    return result;
}

/**
 * Upsert multiple contacts (create or update based on phone number).
 * Used for syncing contacts from Google.
 */
export async function upsertContacts(
    firebaseUid: string,
    contacts: Array<{
        googleContactId?: string;
        name: string;
        phoneNumbers: string[];
        email: string | null;
        jobTitle?: string;
        company?: string;
    }>
): Promise<{ created: number; updated: number }> {
    const db = await getMongoDb();
    const collection = db.collection<Contact>(Collections.CONTACTS);
    const now = new Date();

    let created = 0;
    let updated = 0;

    for (const contact of contacts) {
        const [firstName, ...lastNameParts] = contact.name.split(' ');
        const lastName = lastNameParts.join(' ');

        // Construct filter: Match by googleContactId OR any of the phone numbers
        const filter: any = { firebaseUid };
        if (contact.googleContactId) {
            filter.googleContactId = contact.googleContactId;
        } else if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
            filter.phoneNumbers = { $in: contact.phoneNumbers };
        } else {
            // Skip invalid contacts without ID or phone numbers
            continue;
        }

        const result = await collection.updateOne(
            filter,
            {
                $set: {
                    name: contact.name,
                    email: contact.email || '',
                    phoneNumbers: contact.phoneNumbers,
                    googleContactId: contact.googleContactId,
                    jobTitle: contact.jobTitle || undefined,
                    company: contact.company || undefined,
                    firstName: firstName || '',
                    lastName: lastName || '',
                    updatedAt: now,
                },
                $setOnInsert: {
                    firebaseUid,
                    createdAt: now,
                    totalRecordings: 0,
                    lastRecordingAt: null,
                },
            },
            { upsert: true }
        );

        if (result.upsertedCount > 0) {
            created++;
        } else if (result.modifiedCount > 0) {
            updated++;
        }
    }

    if (created > 0) {
        // Increment user's contact count
        const { incrementContactCount } = await import('./users');
        await incrementContactCount(firebaseUid, created);
    }

    return { created, updated };
}

/**
 * Increment the recording count for a contact.
 */
export async function incrementContactRecordings(
    contactId: string,
    firebaseUid: string,
    recordingDate: Date
): Promise<void> {
    const db = await getMongoDb();
    const { ObjectId } = await import('mongodb');

    await db.collection<Contact>(Collections.CONTACTS).updateOne(
        { _id: new ObjectId(contactId), firebaseUid },
        {
            $inc: { totalRecordings: 1 },
            $set: {
                lastRecordingAt: recordingDate,
                updatedAt: new Date(),
            },
        }
    );
}

/**
 * Count all contacts for a user.
 */
export async function countContactsByUser(firebaseUid: string): Promise<number> {
    const db = await getMongoDb();

    // Lazy migration: Check if user has totalContacts count
    const { findUserByFirebaseUid, updateUser } = await import('./users');
    const user = await findUserByFirebaseUid(firebaseUid);

    if (user && typeof user.totalContacts === 'number') {
        return user.totalContacts;
    }

    // Fallback + Migration: Count manually and update user profile
    const count = await db.collection<Contact>(Collections.CONTACTS).countDocuments({ firebaseUid });

    // Update user profile asynchronously (don't block return)
    updateUser(firebaseUid, { totalContacts: count }).catch(err => {
        console.error('Failed to migrate totalContacts count:', err);
    });

    return count;
}

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
        .collation({ locale: 'en', strength: 2 })
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

    return db.collection<Contact>(Collections.CONTACTS).findOne(
        {
            firebaseUid,
            name,
        },
        { collation: { locale: 'en', strength: 2 } }
    );
}

/**
 * Create a new contact.
 */
/**
 * Create a new contact.
 * If a contact with the same phone number exists, it will be updated (merged) instead of throwing an error.
 */
export async function createContact(data: CreateContactInput): Promise<Contact> {
    const db = await getMongoDb();
    const now = new Date();

    // Check for existing contact with same phone number
    if (data.phoneNumbers && data.phoneNumbers.length > 0) {
        const existing = await db.collection<Contact>(Collections.CONTACTS).findOne({
            firebaseUid: data.firebaseUid,
            phoneNumbers: { $in: data.phoneNumbers }
        });

        if (existing) {
            // Merge logic for manual creation: Update name/email if provided, preserve existing stats
            const updateData: any = { updatedAt: now };
            if (data.name) updateData.name = data.name;
            if (data.email) updateData.email = data.email;
            if (data.jobTitle) updateData.jobTitle = data.jobTitle;
            if (data.company) updateData.company = data.company;
            // Add any new phone numbers to the set

            const result = await db.collection<Contact>(Collections.CONTACTS).findOneAndUpdate(
                { _id: existing._id },
                {
                    $set: updateData,
                    $addToSet: { phoneNumbers: { $each: data.phoneNumbers } }
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

    // Increment user's contact count
    const { incrementContactCount } = await import('./users');
    await incrementContactCount(data.firebaseUid, 1);

    // Link any existing recordings to this new contact
    let stats: { totalRecordings: number; lastRecordingAt: Date | null } = { totalRecordings: 0, lastRecordingAt: null };
    if (data.phoneNumbers && data.phoneNumbers.length > 0) {
        stats = await linkRecordingsToContact(result.insertedId, data.phoneNumbers, data.firebaseUid);
    }

    return {
        ...contactDoc,
        _id: result.insertedId,
        ...stats
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
 * Handles merging of duplicates and relinking of recordings.
 * Uses sequential processing with in-memory tracking to handle intra-batch duplicates and prevent E11000 errors.
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
    const recordingsCollection = db.collection(Collections.RECORDINGS);
    const { ObjectId } = await import('mongodb');
    const now = new Date();

    let created = 0;
    let updated = 0;

    // 1. Pre-fetch existing contacts
    const existingContacts = await collection.find({ firebaseUid }).toArray();
    const googleIdMap = new Map<string, Contact>();
    const phoneMap = new Map<string, Contact>();

    existingContacts.forEach(c => {
        if (c.googleContactId) googleIdMap.set(c.googleContactId, c);
        if (c.phoneNumbers && Array.isArray(c.phoneNumbers)) {
            c.phoneNumbers.forEach(p => {
                if (!phoneMap.has(p)) phoneMap.set(p, c);
            });
        }
    });

    // 2. Track processed items in this batch to handle intra-batch duplicates
    // Maps Phone Number -> Contact ID (of the document handled in this batch)
    const batchProcessedPhones = new Map<string, import('mongodb').ObjectId>();
    // Maps Google ID -> Contact ID
    const batchProcessedGoogleIds = new Map<string, import('mongodb').ObjectId>();

    for (const contact of contacts) {
        const [firstName, ...lastNameParts] = contact.name.split(' ');
        const lastName = lastNameParts.join(' ');

        // A. Resolve Match Candidates

        // 1. Check Google ID (DB + Batch)
        let googleMatchId: import('mongodb').ObjectId | undefined = undefined;
        let googleMatchDoc: Contact | undefined = undefined;

        if (contact.googleContactId) {
            // Check batch first
            if (batchProcessedGoogleIds.has(contact.googleContactId)) {
                googleMatchId = batchProcessedGoogleIds.get(contact.googleContactId);
            } else if (googleIdMap.has(contact.googleContactId)) {
                googleMatchDoc = googleIdMap.get(contact.googleContactId);
                googleMatchId = googleMatchDoc?._id;
            }
        }

        // 2. Check Phone Numbers (DB + Batch)
        let phoneMatchId: import('mongodb').ObjectId | undefined = undefined;
        let phoneMatchDoc: Contact | undefined = undefined;

        if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
            for (const p of contact.phoneNumbers) {
                // Check batch first
                if (batchProcessedPhones.has(p)) {
                    phoneMatchId = batchProcessedPhones.get(p);
                    break;
                }
                // Check DB
                if (phoneMap.has(p)) {
                    const found = phoneMap.get(p);
                    // Exclude if it's the same doc as established google match
                    if (found && (!googleMatchId || !found._id.equals(googleMatchId))) {
                        phoneMatchDoc = found;
                        phoneMatchId = found._id;
                        break;
                    }
                }
            }
        }

        const contactData = {
            name: contact.name,
            email: contact.email || '',
            googleContactId: contact.googleContactId,
            jobTitle: contact.jobTitle || undefined,
            company: contact.company || undefined,
            firstName: firstName || '',
            lastName: lastName || '',
            updatedAt: now,
        };

        let targetId: import('mongodb').ObjectId | undefined = undefined;

        // B. Handle Scenarios using IDs
        if (googleMatchId && phoneMatchId && !googleMatchId.equals(phoneMatchId)) {
            // MERGE SCENARIO: Google Match AND separate Phone Match exist.
            // Priority: Google Match wins. Phone Match is merged/deleted.

            if (phoneMatchDoc) {
                // 1. Relink recordings
                await recordingsCollection.updateMany(
                    { contactId: phoneMatchDoc._id },
                    { $set: { contactId: googleMatchId } }
                );
                // 2. Delete phone doc
                await collection.deleteOne({ _id: phoneMatchDoc._id });
                updated++;

                // Clean maps
                if (phoneMatchDoc.phoneNumbers) phoneMatchDoc.phoneNumbers.forEach(p => phoneMap.delete(p));
                const { incrementContactCount } = await import('./users');
                await incrementContactCount(firebaseUid, -1);
            }
            targetId = googleMatchId;
        } else if (googleMatchId) {
            targetId = googleMatchId;
        } else if (phoneMatchId) {
            targetId = phoneMatchId;
        }

        // C. Perform DB Action
        const finalPhoneNumbers = contact.phoneNumbers || [];

        if (targetId) {
            // Update
            await collection.updateOne(
                { _id: targetId },
                {
                    $set: contactData,
                    $addToSet: { phoneNumbers: { $each: finalPhoneNumbers } }
                }
            );
            updated++;

            if (finalPhoneNumbers.length > 0) {
                await linkRecordingsToContact(targetId, finalPhoneNumbers, firebaseUid);
            }
        } else {
            // New Insert
            const res = await collection.insertOne({
                ...contactData,
                firebaseUid,
                createdAt: now,
                phoneNumbers: finalPhoneNumbers,
                totalRecordings: 0,
                lastRecordingAt: null
            } as Contact);
            targetId = res.insertedId;
            created++;

            if (finalPhoneNumbers.length > 0) {
                await linkRecordingsToContact(targetId, finalPhoneNumbers, firebaseUid);
            }
        }

        // D. Update Batch Tracking
        if (targetId) {
            if (contact.googleContactId) batchProcessedGoogleIds.set(contact.googleContactId, targetId);
            finalPhoneNumbers.forEach(p => batchProcessedPhones.set(p, targetId!));
        }
    }

    if (created > 0) {
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
    recordingDate: Date,
    amount: number = 1
): Promise<void> {
    const db = await getMongoDb();
    const { ObjectId } = await import('mongodb');

    const update: any = {
        $inc: { totalRecordings: amount },
        $set: {
            updatedAt: new Date(),
        },
    };

    // Only update lastRecordingAt if we are adding a recording (positive amount)
    if (amount > 0) {
        update.$set.lastRecordingAt = recordingDate;
    }

    await db.collection<Contact>(Collections.CONTACTS).updateOne(
        { _id: new ObjectId(contactId), firebaseUid },
        update
    );
}

/**
 * Count all contacts for a user.
 */
export async function countContactsByUser(firebaseUid: string): Promise<number> {
    // We rely on the user profile to store the total count of contacts.
    // This is maintained by incrementContactCount in createContact/upsertContacts.
    const { findUserByFirebaseUid } = await import('./users');
    const user = await findUserByFirebaseUid(firebaseUid);

    return user?.totalContacts || 0;
}

/**
 * Link existing recordings to a contact based on phone numbers.
 * Recalculates and returns the total recording count and last recording date.
 * This fixes the issue where contacts created AFTER recordings don't show the correct count.
 */
export async function linkRecordingsToContact(
    contactId: string | import('mongodb').ObjectId,
    phoneNumbers: string[],
    firebaseUid: string
): Promise<{ totalRecordings: number; lastRecordingAt: Date | null }> {
    const db = await getMongoDb();
    const { ObjectId } = await import('mongodb');
    const cId = new ObjectId(contactId);

    if (!phoneNumbers || phoneNumbers.length === 0) {
        return { totalRecordings: 0, lastRecordingAt: null };
    }

    // 1. Link orphaned recordings or recordings that match the phone number
    // We update any recording that has this phone number and belongs to this user.
    // We prioritize this contact.
    await db.collection(Collections.RECORDINGS).updateMany(
        {
            firebaseUid,
            phoneNumber: { $in: phoneNumbers },
            contactId: { $ne: cId }
        },
        {
            $set: {
                contactId: cId,
                contactName: (await db.collection<Contact>(Collections.CONTACTS).findOne({ _id: cId }))?.name
            }
        }
    );

    // 2. Count recordings for this contact
    // We count ALL recordings (including archived) to be consistent with "totalRecordings" usually meaning "lifetime"
    const stats = await db.collection(Collections.RECORDINGS).aggregate([
        {
            $match: {
                firebaseUid,
                contactId: cId
            }
        },
        {
            $group: {
                _id: null,
                count: { $sum: 1 },
                lastRecording: { $max: "$recordedAt" }
            }
        }
    ]).toArray();

    const count = stats[0]?.count || 0;
    const lastRecording = stats[0]?.lastRecording || null;

    // 3. Update the contact
    await db.collection<Contact>(Collections.CONTACTS).updateOne(
        { _id: cId },
        {
            $set: {
                totalRecordings: count,
                lastRecordingAt: lastRecording,
                updatedAt: new Date()
            }
        }
    );

    return { totalRecordings: count, lastRecordingAt: lastRecording };
}

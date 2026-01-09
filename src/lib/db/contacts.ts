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
    let stats = { totalRecordings: 0, lastRecordingAt: null };
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
    const now = new Date();

    let created = 0;
    let updated = 0;
    let deleted = 0; // For tracking merges

    for (const contact of contacts) {
        const [firstName, ...lastNameParts] = contact.name.split(' ');
        const lastName = lastNameParts.join(' ');

        // 1. Find by Google ID
        let googleMatch = contact.googleContactId
            ? await collection.findOne({ firebaseUid, googleContactId: contact.googleContactId })
            : null;

        // 2. Find by Phone Numbers (if no Google ID match or to check for conflicts)
        // We only care about phone match if it's NOT the same doc as googleMatch
        let phoneMatch = null;
        if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
            phoneMatch = await collection.findOne({
                firebaseUid,
                phoneNumbers: { $in: contact.phoneNumbers },
                // Exclude the already matched doc if it exists
                ...(googleMatch ? { _id: { $ne: googleMatch._id } } : {})
            });
        }

        const contactData = {
            name: contact.name,
            email: contact.email || '',
            phoneNumbers: contact.phoneNumbers,
            googleContactId: contact.googleContactId,
            jobTitle: contact.jobTitle || undefined,
            company: contact.company || undefined,
            firstName: firstName || '',
            lastName: lastName || '',
            updatedAt: now,
        };

        if (googleMatch && phoneMatch) {
            // MERGE SCENARIO: Found two different contacts (one by ID, one by Phone)
            // Strategy: Merge PhoneMatch INTO GoogleMatch (Google is source of truth)

            // 1. Relink recordings from PhoneMatch to GoogleMatch
            await recordingsCollection.updateMany(
                { contactId: phoneMatch._id },
                { $set: { contactId: googleMatch._id } }
            );

            // 2. Update stats on GoogleMatch
            const totalRecordings = (googleMatch.totalRecordings || 0) + (phoneMatch.totalRecordings || 0);
            const lastRecordingAt = [googleMatch.lastRecordingAt, phoneMatch.lastRecordingAt]
                .filter(d => d)
                .sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0] || null;

            // 3. Update GoogleMatch with new data + merged stats
            // We also merge any unique phone numbers from phoneMatch that weren't in the new list
            const mergedPhoneNumbers = Array.from(new Set([
                ...contact.phoneNumbers,
                ...(phoneMatch.phoneNumbers || [])
            ]));

            await collection.updateOne(
                { _id: googleMatch._id },
                {
                    $set: {
                        ...contactData,
                        phoneNumbers: mergedPhoneNumbers,
                        totalRecordings,
                        lastRecordingAt
                    }
                }
            );

            // 4. Delete PhoneMatch
            await collection.deleteOne({ _id: phoneMatch._id });
            updated++;
            deleted++;

            // Decrement count for the deleted duplicate
            const { incrementContactCount } = await import('./users');
            await incrementContactCount(firebaseUid, -1);

        } else if (googleMatch) {
            // Update existing Google Contact
            await collection.updateOne(
                { _id: googleMatch._id },
                { $set: contactData }
            );
            updated++;

            // Ensure recordings are linked (in case new numbers were added)
            if (contactData.phoneNumbers?.length) {
                await linkRecordingsToContact(googleMatch._id, contactData.phoneNumbers, firebaseUid);
            }
        } else if (phoneMatch) {
            // Found by phone only - "Adopt" this manual contact as the Google Contact
            await collection.updateOne(
                { _id: phoneMatch._id },
                { $set: contactData }
            );
            updated++;

            // Ensure recordings are linked
            if (contactData.phoneNumbers?.length) {
                await linkRecordingsToContact(phoneMatch._id, contactData.phoneNumbers, firebaseUid);
            }
        } else {
            // New Contact
            const result = await collection.insertOne({
                ...contactData,
                firebaseUid,
                createdAt: now,
                totalRecordings: 0,
                lastRecordingAt: null,
            } as Contact);
            created++;

            // Link existing recordings
            if (contactData.phoneNumbers?.length) {
                await linkRecordingsToContact(result.insertedId, contactData.phoneNumbers, firebaseUid);
            }
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
    // For deletions, we'd ideally recalculate, but skipping for now to keep it simple/performant
    // or we could just leave it as the last time *activity* happened.
    // Let's update it if amount > 0.
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

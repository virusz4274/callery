import { Collections, getMongoDb } from '@/lib/mongodb';
import { setContactCount } from '../../users';
import type { Contact } from '../../types';
import type { UpsertContactInput } from '../types';
import { normalizeGoogleContactInput } from '../normalize';
import { linkRecordingsToContact } from '../link';

/**
 * Replace a user's contact projection from Google Contacts.
 */
export async function upsertContacts(
    firebaseUid: string,
    contacts: UpsertContactInput[]
): Promise<{ created: number; updated: number }> {
    const db = await getMongoDb();
    const collection = db.collection<Contact>(Collections.CONTACTS);
    const recordingsCollection = db.collection(Collections.RECORDINGS);
    const now = new Date();

    let created = 0;
    let updated = 0;
    const existingContacts = await collection.find({
        firebaseUid,
        googleContactId: { $type: 'string' },
    }).toArray();
    const existingByGoogleId = new Map(existingContacts.map((contact) => [contact.googleContactId, contact]));
    const syncedGoogleContactIds = new Set<string>();

    for (const contact of contacts) {
        if (!contact.googleContactId) {
            continue;
        }

        syncedGoogleContactIds.add(contact.googleContactId);

        const normalizedContact = normalizeGoogleContactInput(contact);
        const existingContact = existingByGoogleId.get(contact.googleContactId);

        if (existingContact) {
            await collection.updateOne(
                { _id: existingContact._id },
                {
                    $set: {
                        ...normalizedContact,
                        updatedAt: now,
                    },
                }
            );
            updated++;
            await linkRecordingsToContact(
                existingContact._id,
                normalizedContact.phoneNumbers,
                firebaseUid,
                normalizedContact.name
            );
        } else {
            const result = await collection.insertOne({
                ...normalizedContact,
                firebaseUid,
                createdAt: now,
                updatedAt: now,
                totalRecordings: 0,
                lastRecordingAt: null,
            } as Contact);
            created++;
            await linkRecordingsToContact(
                result.insertedId,
                normalizedContact.phoneNumbers,
                firebaseUid,
                normalizedContact.name
            );
        }
    }

    const staleContacts = existingContacts.filter((contact) => !syncedGoogleContactIds.has(contact.googleContactId));
    if (staleContacts.length > 0) {
        for (const staleContact of staleContacts) {
            await recordingsCollection.updateMany(
                {
                    firebaseUid,
                    contactId: staleContact._id,
                },
                {
                    $set: {
                        contactId: null,
                        contactName: staleContact.name,
                    },
                }
            );
        }

        await collection.deleteMany({
            _id: { $in: staleContacts.map((contact) => contact._id) },
        });
    }

    await setContactCount(
        firebaseUid,
        await collection.countDocuments({
            firebaseUid,
            googleContactId: { $type: 'string' },
        })
    );

    return { created, updated };
}

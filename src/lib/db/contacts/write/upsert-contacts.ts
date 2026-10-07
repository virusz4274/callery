import { Collections, getMongoDb } from '@/lib/mongodb';
import { setContactCount } from '../../users';
import type { Contact } from '../../types';
import type { UpsertContactInput } from '../types';
import { normalizeGoogleContactInput } from '../normalize';
import { reconcileRecordingContacts } from '../reconcile';

/**
 * Replace a user's contact projection from Google Contacts.
 */
export async function upsertContacts(
    authSubject: string,
    contacts: UpsertContactInput[]
): Promise<{ created: number; updated: number }> {
    const db = await getMongoDb();
    const collection = db.collection<Contact>(Collections.CONTACTS);
    const now = new Date();

    let created = 0;
    let updated = 0;
    const existingContacts = await collection.find({
        authSubject,
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
                { _id: existingContact._id, authSubject },
                {
                    $set: {
                        ...normalizedContact,
                        updatedAt: now,
                    },
                }
            );
            updated++;
        } else {
            await collection.insertOne({
                ...normalizedContact,
                authSubject,
                createdAt: now,
                updatedAt: now,
                totalRecordings: 0,
                lastRecordingAt: null,
            } as Contact);
            created++;
        }
    }

    const staleContacts = existingContacts.filter((contact) => !syncedGoogleContactIds.has(contact.googleContactId));
    if (staleContacts.length > 0) {
        await collection.deleteMany({
            authSubject,
            _id: { $in: staleContacts.map((contact) => contact._id) },
        });
    }

    await reconcileRecordingContacts(authSubject, await collection.find({ authSubject }).toArray(), existingContacts, db);

    await setContactCount(
        authSubject,
        await collection.countDocuments({
            authSubject,
        })
    );

    return { created, updated };
}

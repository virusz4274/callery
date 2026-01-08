'use server';

import { upsertContacts } from '@/lib/db/contacts';

type ContactData = {
    googleContactId?: string;
    name: string;
    phoneNumbers: string[];
    email: string | null;
    jobTitle?: string;
    company?: string;
};

/**
 * Saves or updates contacts in MongoDB.
 * @param firebaseUid The Firebase UID of the user.
 * @param contacts An array of contact data to be saved.
 */
export async function saveContactsToMongoDB(
    firebaseUid: string,
    contacts: ContactData[]
): Promise<{ created: number; updated: number }> {
    if (!firebaseUid) {
        throw new Error("Firebase UID is required to save contacts.");
    }
    if (!contacts || contacts.length === 0) {
        return { created: 0, updated: 0 };
    }

    const result = await upsertContacts(firebaseUid, contacts);

    // Asynchronously migrate any unknown recordings to the newly saved contacts
    // This runs in the background and doesn't block the response
    if (result.created > 0) {
        // Import migration function dynamically to avoid circular dependencies
        import('@/lib/db/migrate-unknown-recordings')
            .then(({ migrateUnknownRecordingsToContact }) => {
                // For each newly created contact, attempt migration
                contacts.forEach(async (contact) => {
                    if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
                        // We need to find the contact ID to migrate
                        // For now, we'll trigger migration for all phone numbers
                        const { findContactByPhone } = await import('@/lib/db/contacts');
                        const foundContact = await findContactByPhone(firebaseUid, contact.phoneNumbers[0]);

                        if (foundContact) {
                            const migratedCount = await migrateUnknownRecordingsToContact(
                                firebaseUid,
                                foundContact._id.toString(),
                                contact.phoneNumbers,
                                contact.name
                            );

                            if (migratedCount > 0) {
                                console.log(`Migrated ${migratedCount} recordings for contact ${foundContact.name}`);
                            }
                        }
                    }
                });
            })
            .catch(err => {
                console.error('Failed to migrate unknown recordings:', err);
            });
    }

    return result;
}



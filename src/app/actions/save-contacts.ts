'use server';

import { upsertContacts } from '@/lib/db/contacts';

type ContactData = {
    googleContactId: string;
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

    return upsertContacts(firebaseUid, contacts);
}

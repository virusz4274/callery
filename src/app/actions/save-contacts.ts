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
 * @param authSubject The auth subject of the user.
 * @param contacts An array of contact data to be saved.
 */
export async function saveContactsToMongoDB(
    authSubject: string,
    contacts: ContactData[]
): Promise<{ created: number; updated: number }> {
    if (!authSubject) {
        throw new Error("auth subject is required to save contacts.");
    }
    if (!contacts) {
        return { created: 0, updated: 0 };
    }

    return upsertContacts(authSubject, contacts);
}

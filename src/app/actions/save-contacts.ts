'use server';

import { getAuthSubjectFromSession } from '@/lib/auth-utils';

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
 * The caller must be authenticated as the target user — the authSubject
 * parameter alone is never trusted, otherwise anyone could write contacts
 * into anyone else's account.
 * @param authSubject The auth subject of the user.
 * @param contacts An array of contact data to be saved.
 */
export async function saveContactsToMongoDB(
    authSubject: string,
    contacts: ContactData[]
): Promise<{ created: number; updated: number }> {
    if (!authSubject) {
        throw new Error('Auth subject is required to save contacts.');
    }

    const sessionSubject = await getAuthSubjectFromSession();
    if (!sessionSubject || sessionSubject !== authSubject) {
        throw new Error('Unauthorized');
    }

    if (!contacts || contacts.length === 0) {
        return { created: 0, updated: 0 };
    }

    const { persistSyncedContacts } = await import('@/lib/db/contacts');
    return persistSyncedContacts(authSubject, contacts);
}

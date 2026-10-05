import type { Contact, UpdateContactInput } from '../../types';

/**
 * Contacts are projected from Google Contacts only.
 */
export async function updateContact(
    contactId: string,
    authSubject: string,
    _data: UpdateContactInput
): Promise<Contact | null> {
    throw new Error(`Manual contact updates are disabled for ${authSubject}:${contactId}.`);
}

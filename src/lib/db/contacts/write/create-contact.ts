import type { Contact, CreateContactInput } from '../../types';

/**
 * Contacts are projected from Google Contacts only.
 */
export async function createContact(data: CreateContactInput): Promise<Contact> {
    throw new Error(`Manual contact creation is disabled. Contacts must come from Google sync for ${data.authSubject}.`);
}

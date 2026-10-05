import { people, type people_v1 } from '@googleapis/people';
import type { OAuth2Client } from 'google-auth-library';
import { saveContactsToMongoDB } from '@/app/actions/save-contacts';
import { normalizeContactPhoneNumbers } from '@/lib/db/contacts/normalize';
import type { GoogleSyncDuplicatePhoneIssue } from '@/lib/db/types';
import { logger } from '@/lib/logger';

function errorLog(userId: string, message: string, error?: unknown) {
    const timestamp = new Date().toISOString();
    const prefix = `[GoogleSync][ERROR][${userId}][${timestamp}]`;
    if (error instanceof Error) {
        logger.error(`${prefix} ${message}`, { message: error.message, stack: error.stack });
    } else {
        logger.error(`${prefix} ${message}`, error);
    }
}

/**
 * Syncs Google Contacts in the background.
 * This function is designed to be called within `next/after` or a background job.
 *
 * @param userId - The Firebase UID of the user.
 * @param authClient - The authenticated OAuth2Client.
 */
type ContactRecord = {
    googleContactId: string;
    name: string;
    phoneNumbers: string[];
    email: string | null;
    jobTitle?: string;
    company?: string;
};

export async function syncContactsBackground(
    userId: string,
    authClient: OAuth2Client
): Promise<{ importedCount: number; duplicatePhoneIssues: GoogleSyncDuplicatePhoneIssue[] }> {
    try {
        const peopleService: people_v1.People = people({ version: 'v1', auth: authClient });

        let nextPageToken: string | undefined = undefined;
        const contactsToSave: ContactRecord[] = [];

        do {
            const response: { data: people_v1.Schema$ListConnectionsResponse } =
                await peopleService.people.connections.list({
                    resourceName: 'people/me',
                    personFields: 'names,emailAddresses,phoneNumbers,organizations',
                    pageSize: 100,
                    pageToken: nextPageToken,
                });

            const connections: people_v1.Schema$Person[] = response.data.connections || [];
            nextPageToken = response.data.nextPageToken || undefined;

            if (connections.length > 0) {
                const pageContacts = connections
                    .map((person): ContactRecord | null => {
                        const name = person.names?.[0]?.displayName;
                        const phoneNumbers = (person.phoneNumbers
                            ?.map((p) => p.value)
                            .filter((value): value is string => Boolean(value))) || [];
                        const googleContactId = person.resourceName;

                        if (name && phoneNumbers.length > 0 && googleContactId) {
                            const organization = person.organizations?.[0];
                            return {
                                googleContactId,
                                name,
                                phoneNumbers,
                                email: person.emailAddresses?.[0]?.value || null,
                                jobTitle: organization?.title || undefined,
                                company: organization?.name || undefined,
                            };
                        }
                        return null;
                    })
                    .filter((c): c is ContactRecord => c !== null);

                contactsToSave.push(...pageContacts);
            }

        } while (nextPageToken);

        const duplicatePhoneIssues = logDuplicateNormalizedPhones(userId, contactsToSave);
        await saveContactsToMongoDB(userId, contactsToSave);

        return {
            importedCount: contactsToSave.length,
            duplicatePhoneIssues,
        };

    } catch (error) {
        errorLog(userId, 'Sync failed.', error);
        throw error;
    }
}

function logDuplicateNormalizedPhones(
    userId: string,
    contacts: Array<{ name: string; phoneNumbers: string[] }>
): GoogleSyncDuplicatePhoneIssue[] {
    const duplicates = new Map<string, Set<string>>();

    for (const contact of contacts) {
        const normalizedPhoneNumbers = normalizeContactPhoneNumbers(contact.phoneNumbers);

        for (const phoneNumber of normalizedPhoneNumbers) {
            const names = duplicates.get(phoneNumber) ?? new Set<string>();
            names.add(contact.name);
            duplicates.set(phoneNumber, names);
        }
    }

    const issues: GoogleSyncDuplicatePhoneIssue[] = [];

    for (const [phoneNumber, names] of duplicates.entries()) {
        const normalizedLength = phoneNumber.replace(/^\+/, '').length;
        if (names.size <= 1 || normalizedLength <= 3) {
            continue;
        }

        const issue = {
            phoneNumber,
            names: [...names].sort((left, right) => left.localeCompare(right)),
        };

        issues.push(issue);
        logger.warn(`[GoogleSync][WARN][${userId}] Duplicate normalized phone across Google contacts`, issue);
    }

    return issues.sort((left, right) => left.phoneNumber.localeCompare(right.phoneNumber));
}

import { google } from 'googleapis';
import { saveContactsToMongoDB } from '@/app/actions/save-contacts';

function errorLog(userId: string, message: string, error?: any) {
    const timestamp = new Date().toISOString();
    const prefix = `[GoogleSync][ERROR][${userId}][${timestamp}]`;
    if (error instanceof Error) {
        console.error(`${prefix} ${message}`, { message: error.message, stack: error.stack });
    } else {
        console.error(`${prefix} ${message}`, error);
    }
}

/**
 * Syncs Google Contacts in the background.
 * This function is designed to be called within `next/after` or a background job.
 * 
 * @param userId - The Firebase UID of the user.
 * @param authClient - The authenticated OAuth2Client.
 */
export async function syncContactsBackground(userId: string, authClient: any): Promise<number> {
    try {
        const peopleService = google.people({ version: 'v1', auth: authClient });

        let nextPageToken: string | undefined = undefined;
        let totalSynced = 0;

        do {
            const response = await peopleService.people.connections.list({
                resourceName: 'people/me',
                personFields: 'names,emailAddresses,phoneNumbers,organizations',
                pageSize: 100, // Process in chunks of 100
                pageToken: nextPageToken,
            }) as any;

            const connections = response.data.connections || [];
            nextPageToken = response.data.nextPageToken || undefined;

            if (connections.length > 0) {
                // Transform to our internal format
                const contactsToSave = connections
                    .map((person: any) => {
                        const name = person.names?.[0]?.displayName;
                        const phoneNumbers = person.phoneNumbers?.map((p: any) => p.value).filter(Boolean) as string[];

                        if (name && phoneNumbers && phoneNumbers.length > 0) {
                            const organization = person.organizations?.[0];
                            return {
                                googleContactId: person.resourceName ?? undefined,
                                name,
                                phoneNumbers,
                                email: person.emailAddresses?.[0]?.value || null,
                                jobTitle: organization?.title || undefined,
                                company: organization?.name || undefined,
                            };
                        }
                        return null;
                    })
                    .filter((c: any) => c !== null);

                if (contactsToSave.length > 0) {
                    // We assume saveContactsToMongoDB handles batch upserts efficiently
                    await saveContactsToMongoDB(userId, contactsToSave);
                    totalSynced += contactsToSave.length;
                }
            }

        } while (nextPageToken);

        return totalSynced;

    } catch (error) {
        errorLog(userId, 'Sync failed.', error);
        throw error;
    }
}

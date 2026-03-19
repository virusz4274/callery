
'use server';

import { restartGoogleContactsSync, startGoogleContactsSync } from '@/services/google/start-contacts-sync';


export async function syncGoogleContacts(code?: string) {
    if (code) {
        return startGoogleContactsSync(code);
    }

    return restartGoogleContactsSync();
}

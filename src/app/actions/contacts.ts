'use server';

import { getGoogleContacts } from '@/services/google/contacts';
import { getOAuth2Client } from '@/services/google/oauth';
import { revalidatePath } from 'next/cache';
import { saveContactsToFirestore } from './save-contacts';
import { headers } from 'next/headers';
import { getAuth } from 'firebase-admin/auth';
import { getFirebaseAdminApp } from '@/firebase/admin';

async function getUserIdFromSessionCookie() {
    try {
        const sessionCookie = headers().get('x-session-cookie');
        if (!sessionCookie) {
            console.error('Session cookie not found in headers.');
            return null;
        }
        const adminApp = getFirebaseAdminApp();
        const decodedIdToken = await getAuth(adminApp).verifySessionCookie(sessionCookie, true);
        return decodedIdToken.uid;
    } catch (error) {
        console.error('Error verifying session cookie in server action:', error);
        return null;
    }
}


export async function syncGoogleContacts(code: string, state: string) {
  try {
    const oAuth2Client = getOAuth2Client();
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    const contacts = await getGoogleContacts(oAuth2Client);
    
    const userId = await getUserIdFromSessionCookie();
    if (!userId) {
        return { success: false, error: 'User authentication failed. Could not save contacts.' };
    }
    
    await saveContactsToFirestore(userId, contacts);

    revalidatePath('/contacts');
    revalidatePath('/settings');
    return { success: true, count: contacts.length };
  } catch (error) {
    console.error('Error syncing Google contacts:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred.';
    return { success: false, error: errorMessage };
  }
}

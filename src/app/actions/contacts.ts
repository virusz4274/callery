
'use server';

import { getOAuth2Client } from '@/services/google/oauth';
import { after } from 'next/server';
import { syncContactsBackground } from '@/services/google/contacts-sync';
import { saveContactsToMongoDB } from './save-contacts';
import { cookies } from 'next/headers';
import { getAuth } from 'firebase-admin/auth';
import { getFirebaseAdminApp } from '@/lib/firebase/admin';

/**
 * Securely gets the user ID from the session cookie passed in the headers.
 * This function MUST be called from a Server Action or Route Handler.
 * @returns The user's UID or null if the cookie is invalid or not present.
 */
async function getUserIdFromSessionCookie() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');

    if (!sessionCookie || !sessionCookie.value) {
      console.error('Session cookie not found.');
      return null;
    }

    // Initialize admin app (safe to call multiple times)
    const adminApp = getFirebaseAdminApp();
    // Verify the cookie and get the user's decoded token
    const decodedIdToken = await getAuth(adminApp).verifySessionCookie(sessionCookie.value, true);
    return decodedIdToken.uid;
  } catch (error) {
    // This will catch invalid/expired cookies
    console.error('Error verifying session cookie in server action:', error);
    return null;
  }
}


export async function syncGoogleContacts(code: string) {

  try {
    const oAuth2Client = getOAuth2Client();
    const { tokens } = await oAuth2Client.getToken(code);

    oAuth2Client.setCredentials(tokens);

    // Get the user ID securely on the server
    const userId = await getUserIdFromSessionCookie();
    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }



    // Schedule the sync to run in the background after the response is sent
    // This prevents the request from timing out
    after(async () => {
      try {
        // Re-initialize client in the background scope just to be safe/clean
        const bgClient = getOAuth2Client();
        bgClient.setCredentials(tokens);

        await syncContactsBackground(userId, bgClient);
      } catch (err) {
        console.error(`[syncGoogleContacts] Background sync failed for user ${userId}:`, err);
      }
    });

    // Return success immediately
    return { success: true, message: 'Sync started in background.' };
  } catch (error) {
    console.error('Error initiating Google contacts sync:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred.';
    return { success: false, error: errorMessage };
  }
}

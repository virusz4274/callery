
'use server';

import { getOAuth2Client } from '@/services/google/oauth';
import { after } from 'next/server';
import { syncContactsBackground } from '@/services/google/contacts-sync';
import { getAuthSubjectFromSession } from '@/lib/auth-utils';


export async function syncGoogleContacts(code: string) {

  try {
    const oAuth2Client = getOAuth2Client();
    const { tokens } = await oAuth2Client.getToken(code);

    oAuth2Client.setCredentials(tokens);

    // Get the user ID securely on the server
    const userId = await getAuthSubjectFromSession();
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

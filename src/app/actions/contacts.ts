'use server';

import { getGoogleContacts } from '@/services/google/contacts';
import { getOAuth2Client } from '@/services/google/oauth';
import { revalidatePath } from 'next/cache';

export async function syncGoogleContacts(code: string, state: string) {
  try {
    const oAuth2Client = getOAuth2Client();
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    // For this example, we'll just log the contacts.
    // In a real app, you would save these to your database.
    const contacts = await getGoogleContacts(oAuth2Client);
    console.log('Fetched contacts:', contacts.length);

    // Here you would typically save the contacts to Firestore
    // e.g., saveContactsToFirestore(userId, contacts);

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

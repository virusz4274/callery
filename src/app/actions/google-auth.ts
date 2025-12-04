'use server';

import { getOAuth2Client } from '@/services/google/oauth';

// These should match your Google Cloud project settings
const SCOPES = ['https://www.googleapis.com/auth/contacts.readonly'];

export async function getGoogleAuthUrl() {
  const oAuth2Client = getOAuth2Client();

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    // A random string for security
    state: Math.random().toString(36).substring(2, 15),
  });

  return { url: authUrl };
}

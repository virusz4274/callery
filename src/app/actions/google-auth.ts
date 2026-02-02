'use server';

import { getOAuth2Client } from '@/services/google/oauth';

// These should match your Google Cloud project settings
const SCOPES = ['https://www.googleapis.com/auth/contacts.readonly'];

function getBaseUrl() {
  // Use the reliable environment variable provided by App Hosting.
  // Fall back to localhost for local development/Cloud Workstation.
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9000';
}


export async function getGoogleAuthUrl() {
  // Use the environment variable if set, otherwise construct it dynamically
  const redirectUri = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI || `${getBaseUrl()}/api/auth/google/callback`;

  const oAuth2Client = getOAuth2Client(redirectUri);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent screen to ensure scopes are granted and we get a refresh token
    // A random string for security
    state: Math.random().toString(36).substring(2, 15),
  });

  return { url: authUrl };
}

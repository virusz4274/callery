'use server';

import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { getOAuth2Client, GOOGLE_OAUTH_STATE_COOKIE } from '@/services/google/oauth';

// These should match your Google Cloud project settings
const SCOPES = ['https://www.googleapis.com/auth/contacts.readonly'];

function getBaseUrl() {
  // Use the reliable environment variable provided by App Hosting.
  // Fall back to localhost for local development/Cloud Workstation.
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9000';
}


export async function getGoogleAuthUrl() {
  const { getAuthSubjectFromSession } = await import('@/lib/auth-utils');
  const authSubject = await getAuthSubjectFromSession();
  if (!authSubject) {
    throw new Error('Unauthorized');
  }

  // Use the environment variable if set, otherwise construct it dynamically
  const redirectUri = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI || `${getBaseUrl()}/api/auth/google/callback`;

  const oAuth2Client = getOAuth2Client(redirectUri);

  // CSRF protection: random state stored in an httpOnly cookie, verified
  // by the callback route before the code is honored.
  const state = randomBytes(16).toString('hex');
  const cookieStore = await cookies();
  cookieStore.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60, // 10 minutes
  });

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent screen to ensure scopes are granted and we get a refresh token
    state,
  });

  return { url: authUrl };
}

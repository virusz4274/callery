'use server';

import crypto from 'crypto';
import { cookies } from 'next/headers';
import { getOAuth2Client } from '@/services/google/oauth';
import { env } from '@/lib/env';

const SCOPES = ['https://www.googleapis.com/auth/contacts.readonly'];

export async function getGoogleAuthUrl() {
  const redirectUri = env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI;
  const state = crypto.randomUUID();

  (await cookies()).set('google_oauth_state', state, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  });

  const oAuth2Client = getOAuth2Client(redirectUri);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent screen to ensure scopes are granted and we get a refresh token
    state,
  });

  return { url: authUrl };
}

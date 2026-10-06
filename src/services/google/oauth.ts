import { OAuth2Client } from 'google-auth-library';
import { env } from '@/lib/env';
import { getGoogleCredentials } from '@/lib/auth/config';

export function getOAuth2Client(redirectUri?: string) {
  const credentials = getGoogleCredentials();
  if (!credentials) {
    throw new Error(
      'Google OAuth environment variables are not set. Please provide NEXT_PUBLIC_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
    );
  }

  // Use the passed redirectUri, or fall back to the environment variable
  const callbackUrl = redirectUri || env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI
    || `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/auth/google/callback`;

  return new OAuth2Client(
    credentials.clientId,
    credentials.clientSecret,
    callbackUrl
  );
}

/** Contacts authorization is requested separately from identity login. */
export function buildGoogleContactsAuthUrl(state: string): string {
  return getOAuth2Client().generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/contacts.readonly'],
    prompt: 'consent',
    state,
  });
}

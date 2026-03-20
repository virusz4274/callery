import { google } from 'googleapis';
import { env } from '@/lib/env';

export function getOAuth2Client(redirectUri?: string) {
  const clientId = env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Google OAuth environment variables are not set. Please provide NEXT_PUBLIC_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
    );
  }

  // Use the passed redirectUri, or fall back to the environment variable
  const callbackUrl = redirectUri || env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI;

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    callbackUrl
  );
}

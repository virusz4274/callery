import { OAuth2Client } from 'google-auth-library';

export function getOAuth2Client(redirectUri?: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Google OAuth environment variables are not set. Please provide NEXT_PUBLIC_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
    );
  }

  // Use the passed redirectUri, or fall back to the environment variable
  const callbackUrl = redirectUri || process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI;

  return new OAuth2Client(
    clientId,
    clientSecret,
    callbackUrl
  );
}

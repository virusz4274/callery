import { OAuth2Client } from 'google-auth-library';

let oAuth2Client: OAuth2Client | undefined;

export function getOAuth2Client(redirectUri?: string): OAuth2Client {
    if (
      !process.env.GOOGLE_CLIENT_ID ||
      !process.env.GOOGLE_CLIENT_SECRET
    ) {
      throw new Error(
        'Google OAuth environment variables are not set. Please provide GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
      );
    }
    // Allow redirect URI to be set dynamically
    return new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );
}

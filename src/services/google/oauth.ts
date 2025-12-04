import { OAuth2Client } from 'google-auth-library';

let oAuth2Client: OAuth2Client | undefined;

export function getOAuth2Client(): OAuth2Client {
  if (!oAuth2Client) {
    if (
      !process.env.GOOGLE_CLIENT_ID ||
      !process.env.GOOGLE_CLIENT_SECRET ||
      !process.env.GOOGLE_REDIRECT_URI
    ) {
      throw new Error(
        'Google OAuth environment variables are not set. Please provide GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.'
      );
    }
    oAuth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }
  return oAuth2Client;
}

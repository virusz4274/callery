import { getOAuth2Client } from '@/services/google/oauth';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code) {
    return NextResponse.redirect(
      new URL('/settings?error=Permissions+denied', request.url)
    );
  }

  try {
    // Re-initialize the client with the same redirect URI used for the auth request
    const redirectUri = `${new URL(request.url).origin}/api/auth/google/callback`;
    const oAuth2Client = getOAuth2Client(redirectUri);
    
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    // Here you can store the tokens securely, e.g., associated with the user in Firestore
    console.log('Successfully retrieved tokens.');

    // Redirect back to settings page with code and state for server action processing
    const redirectUrl = new URL('/settings', request.url);
    redirectUrl.searchParams.set('g_code', code);
    if (state) {
      redirectUrl.searchParams.set('g_state', state);
    }
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    return NextResponse.redirect(
      new URL('/settings?error=Authentication+failed', request.url)
    );
  }
}

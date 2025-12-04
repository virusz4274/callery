
import { getOAuth2Client } from '@/services/google/oauth';
import { NextRequest, NextResponse } from 'next/server';

/**
 * This is the callback route that Google redirects to after the user has
 * authenticated. It is responsible for exchanging the authorization code
 * for an access token and a refresh token.
 * @param request The incoming request from Google.
 * @returns A redirect to the settings page with the code and state.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  // Check for an error query parameter
  const error = searchParams.get('error');
  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent(error)}&tab=data`, request.url)
    );
  }

  if (code) {
    try {
      // Redirect back to settings page with code and state for server action processing
      const redirectUrl = new URL('/settings', request.url);
      redirectUrl.searchParams.set('g_code', code);
      if (state) {
        redirectUrl.searchParams.set('g_state', state);
      }
      redirectUrl.searchParams.set('tab', 'data');
      return NextResponse.redirect(redirectUrl);
    } catch (error) {
      console.error('Error exchanging code for tokens:', error);
      return NextResponse.redirect(
        new URL('/settings?error=Authentication+failed&tab=data', request.url)
      );
    }
  }
}

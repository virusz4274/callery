
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

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
  const cookieStore = await cookies();
  const expectedState = cookieStore.get('google_oauth_state')?.value;
  cookieStore.delete('google_oauth_state');

  // Check for an error query parameter
  const error = searchParams.get('error');
  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent(error)}&tab=data`, request.url)
    );
  }

  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(
      new URL('/settings?error=Invalid+OAuth+state&tab=data', request.url)
    );
  }

  if (code) {
    try {
      // Redirect back to settings page with code for server action processing
      const redirectUrl = new URL('/settings', request.url);
      redirectUrl.searchParams.set('g_code', code);
      redirectUrl.searchParams.set('tab', 'data');
      return NextResponse.redirect(redirectUrl);
    } catch (error) {
      console.error('Error exchanging code for tokens:', error);
      return NextResponse.redirect(
        new URL('/settings?error=Authentication+failed&tab=data', request.url)
      );
    }
  }

  return NextResponse.redirect(
    new URL('/settings?error=Missing+authorization+code&tab=data', request.url)
  );
}

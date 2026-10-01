
import { NextRequest, NextResponse } from 'next/server';
import { GOOGLE_OAUTH_STATE_COOKIE } from '@/services/google/oauth';

/**
 * This is the callback route that Google redirects to after the user has
 * authenticated. It verifies the OAuth state token (CSRF protection) and
 * redirects to the settings page with the code for server-action processing.
 * @param request The incoming request from Google.
 * @returns A redirect to the settings page.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  const errorRedirect = (message: string) => {
    const url = new URL('/settings', request.url);
    url.searchParams.set('error', message);
    url.searchParams.set('tab', 'data');
    const response = NextResponse.redirect(url);
    response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    return response;
  };

  // Check for an error query parameter
  const error = searchParams.get('error');
  if (error) {
    return errorRedirect(error);
  }

  if (!code) {
    return errorRedirect('Authentication failed: no authorization code received');
  }

  // Verify state matches the cookie set when the flow started.
  const expectedState = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  if (!state || !expectedState || state !== expectedState) {
    return errorRedirect('Authentication failed: invalid state token. Please try again.');
  }

  // Redirect back to settings page with code and state for server action processing
  const redirectUrl = new URL('/settings', request.url);
  redirectUrl.searchParams.set('g_code', code);
  redirectUrl.searchParams.set('g_state', state);
  redirectUrl.searchParams.set('tab', 'data');
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  return response;
}

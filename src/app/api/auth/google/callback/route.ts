import { logger } from '@/lib/logger';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { buildAppUrl } from '@/lib/public-url';
import { startGoogleContactsSync } from '@/services/google/start-contacts-sync';

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
    const redirectUrl = buildAppUrl('/settings?tab=sources', request);
    redirectUrl.searchParams.set('error', error);
    return NextResponse.redirect(redirectUrl);
  }

  if (!state || !expectedState || state !== expectedState) {
    const redirectUrl = buildAppUrl('/settings?tab=sources', request);
    redirectUrl.searchParams.set('error', 'Invalid OAuth state');
    return NextResponse.redirect(redirectUrl);
  }

  if (code) {
    try {
      const result = await startGoogleContactsSync(code);
      const redirectUrl = buildAppUrl('/settings?tab=sources', request);

      if (result.success) {
        redirectUrl.searchParams.set('google_sync', 'started');
      } else {
        redirectUrl.searchParams.set('error', result.error || 'Authentication failed');
      }

      return NextResponse.redirect(redirectUrl);
    } catch (error) {
      logger.error('Error exchanging code for tokens:', error);
      const redirectUrl = buildAppUrl('/settings?tab=sources', request);
      redirectUrl.searchParams.set('error', 'Authentication failed');
      return NextResponse.redirect(redirectUrl);
    }
  }

  const redirectUrl = buildAppUrl('/settings?tab=sources', request);
  redirectUrl.searchParams.set('error', 'Missing authorization code');
  return NextResponse.redirect(redirectUrl);
}

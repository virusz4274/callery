'use server';

import crypto from 'crypto';
import { cookies } from 'next/headers';
import { buildGoogleContactsAuthUrl } from '@/services/google/oauth';
import { env } from '@/lib/env';
import { getAuthSubjectFromSession } from '@/lib/auth-utils';

export async function getGoogleAuthUrl() {
  if (!await getAuthSubjectFromSession()) throw new Error('Unauthorized');
  const state = crypto.randomUUID();

  (await cookies()).set('google_oauth_state', state, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  });

  return { url: buildGoogleContactsAuthUrl(state) };
}

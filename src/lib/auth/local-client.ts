'use client';

import { createAuthClient } from 'better-auth/react';

/**
 * better-auth client for local auth mode. Same-origin by default, so it
 * talks to the /api/auth/* handlers in this app with cookies included.
 * Only used when NEXT_PUBLIC_AUTH_PROVIDER=local.
 */
export const localAuthClient = createAuthClient();

'use client';

import { createAuthClient } from 'better-auth/react';

/**
 * Better Auth client for every deployment. Same-origin by default, so it
 * talks to the /api/auth/* handlers in this app with cookies included.
 */
export const authClient = createAuthClient();

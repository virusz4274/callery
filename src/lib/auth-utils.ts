'use server';

import { NextRequest } from 'next/server';
import { cookies, headers } from 'next/headers';
import { authProvider } from '@/lib/config';
import { verifyIdTokenValue, verifySessionCookieValue } from './auth/firebase';
import { getLocalSessionUser } from './auth/local';

/**
 * Extract and verify the caller's identity from an API request.
 * Returns the auth subject if valid, null otherwise.
 *
 * Firebase mode expects `Authorization: Bearer <id_token>`.
 * Local mode accepts better-auth session cookies or
 * `Authorization: Bearer <session-token>` (same headers object).
 *
 * Expected header format: "Authorization: Bearer <token>"
 */
export async function getUserFromRequest(request: NextRequest): Promise<string | null> {
    if (authProvider() === 'local') {
        const user = await getLocalSessionUser(request.headers);
        return user?.subject ?? null;
    }

    try {
        const authHeader = request.headers.get('Authorization');

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return null;
        }

        const idToken = authHeader.substring(7); // Remove "Bearer " prefix

        if (!idToken) {
            return null;
        }

        const user = await verifyIdTokenValue(idToken);

        return user?.subject ?? null;
    } catch (error) {
        // Token verification failed (expired, invalid, etc.)
        console.error('Token verification failed:', error instanceof Error ? error.message : error);
        return null;
    }
}

/**
 * Get the auth subject from the session cookie.
 * Useful for Server Actions.
 */
export async function getAuthSubjectFromSession(): Promise<string | null> {
    if (authProvider() === 'local') {
        const user = await getLocalSessionUser(await headers());
        return user?.subject ?? null;
    }

    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get('session');

        if (!sessionCookie || !sessionCookie.value) {
            return null;
        }
        const user = await verifySessionCookieValue(sessionCookie.value);
        return user?.subject ?? null;
    } catch (error) {
        console.error('Error verifying session:', error);
        return null;
    }
}

'use server';

import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminAuth } from '@/lib/firebase/admin';

/**
 * Extract and verify Firebase ID token from Authorization header.
 * Returns the Firebase UID if valid, null otherwise.
 * 
 * Expected header format: "Authorization: Bearer <id_token>"
 */
export async function getUserFromRequest(request: NextRequest): Promise<string | null> {
    try {
        const authHeader = request.headers.get('Authorization');

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return null;
        }

        const idToken = authHeader.substring(7); // Remove "Bearer " prefix

        if (!idToken) {
            return null;
        }

        const auth = getAdminAuth();
        const decodedToken = await auth.verifyIdToken(idToken);

        return decodedToken.uid;
    } catch (error) {
        // Token verification failed (expired, invalid, etc.)
        console.error('Token verification failed:', error instanceof Error ? error.message : error);
        return null;
    }
}

/**
 * Get the Firebase UID from the session cookie.
 * Useful for Server Actions.
 */
export async function getFirebaseUidFromSession(): Promise<string | null> {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');

    if (!sessionCookie || !sessionCookie.value) {
        return null;
    }

    try {
        const auth = getAdminAuth();
        const decodedToken = await auth.verifySessionCookie(sessionCookie.value, true);
        return decodedToken.uid;
    } catch (error) {
        console.error('Error verifying session:', error);
        return null;
    }
}

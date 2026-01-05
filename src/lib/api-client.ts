'use client';

import { getAuth } from 'firebase/auth';

/**
 * Get the current user's Firebase ID token.
 * Returns null if no user is logged in.
 */
export async function getIdToken(): Promise<string | null> {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
        return null;
    }

    try {
        return await user.getIdToken();
    } catch (error) {
        console.error('Failed to get ID token:', error);
        return null;
    }
}

/**
 * Create headers with Authorization bearer token for authenticated API requests.
 */
export async function getAuthHeaders(): Promise<HeadersInit> {
    const token = await getIdToken();

    if (!token) {
        return {};
    }

    return {
        'Authorization': `Bearer ${token}`,
    };
}

/**
 * Make an authenticated fetch request.
 * Automatically includes the Firebase ID token in the Authorization header.
 */
export async function authFetch(
    url: string,
    options: RequestInit = {}
): Promise<Response> {
    const token = await getIdToken();

    const headers = new Headers(options.headers);

    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    return fetch(url, {
        ...options,
        headers,
        credentials: 'include',
    });
}

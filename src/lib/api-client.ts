'use client';

import { getAuth } from 'firebase/auth';
import { initializeFirebase } from '@/lib/firebase/client';

/**
 * Get the current user's Firebase ID token.
 * Returns null if no user is logged in.
 */
export async function getIdToken(): Promise<string | null> {
    try {
        initializeFirebase();
        const auth = getAuth();
        const user = auth.currentUser;

        if (!user) {
            return null;
        }

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

// ============================================================================
// Centralized Error Handling
// ============================================================================

/**
 * Custom error class for API errors.
 * Provides structured error information for better error handling.
 */
export class ApiError extends Error {
    public readonly status: number;
    public readonly statusText: string;
    public readonly details?: unknown;

    constructor(
        message: string,
        status: number,
        statusText: string = '',
        details?: unknown
    ) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.statusText = statusText;
        this.details = details;
    }

    /**
     * Check if this is an authentication error (401)
     */
    get isAuthError(): boolean {
        return this.status === 401;
    }

    /**
     * Check if this is a not found error (404)
     */
    get isNotFound(): boolean {
        return this.status === 404;
    }

    /**
     * Check if this is a server error (5xx)
     */
    get isServerError(): boolean {
        return this.status >= 500;
    }
}

/**
 * Parse an error response from the API.
 * Attempts to extract a meaningful error message from the response body.
 */
async function parseErrorResponse(response: Response): Promise<{ message: string; details?: unknown }> {
    const contentType = response.headers.get('content-type');

    // If not JSON, return generic message based on status
    if (!contentType?.includes('application/json')) {
        return { message: `Request failed: ${response.status} ${response.statusText}` };
    }

    try {
        const data = await response.json();
        return {
            message: data.error || data.message || `Request failed: ${response.status}`,
            details: data,
        };
    } catch {
        return { message: `Request failed: ${response.status} ${response.statusText}` };
    }
}

/**
 * Handle an API response and parse JSON.
 * Throws ApiError for non-2xx responses.
 * 
 * @example
 * ```ts
 * const data = await handleApiResponse<User>(response);
 * ```
 */
export async function handleApiResponse<T>(response: Response): Promise<T> {
    // Check if response is OK (2xx)
    if (response.ok) {
        const contentType = response.headers.get('content-type');

        // Handle empty responses
        if (!contentType?.includes('application/json')) {
            return {} as T;
        }

        return response.json() as Promise<T>;
    }

    // Parse and throw error
    const { message, details } = await parseErrorResponse(response);
    throw new ApiError(message, response.status, response.statusText, details);
}

/**
 * Make an authenticated fetch request and handle the response.
 * Combines authFetch with handleApiResponse for a clean API.
 * 
 * @example
 * ```ts
 * const user = await authFetchJson<User>('/api/user/profile');
 * ```
 */
export async function authFetchJson<T>(
    url: string,
    options: RequestInit = {}
): Promise<T> {
    const response = await authFetch(url, options);
    return handleApiResponse<T>(response);
}

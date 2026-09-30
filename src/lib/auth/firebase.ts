// Firebase implementation of the server auth seam.
// Pure verification helpers; session/profile creation stays in the
// firebase-specific login route.
import { getAdminAuth } from '@/lib/firebase/admin';
import type { SessionUser } from './types';

export async function verifySessionCookieValue(cookieValue: string): Promise<SessionUser | null> {
    try {
        const auth = getAdminAuth();
        const decoded = await auth.verifySessionCookie(cookieValue, true);
        if (!decoded.email) return null;
        return {
            subject: decoded.uid,
            email: decoded.email,
            name: decoded.name ?? null,
            image: decoded.picture ?? null,
            provider: 'firebase',
        };
    } catch {
        return null;
    }
}

export async function verifyIdTokenValue(idToken: string): Promise<SessionUser | null> {
    try {
        const auth = getAdminAuth();
        const decoded = await auth.verifyIdToken(idToken);
        if (!decoded.email) return null;
        return {
            subject: decoded.uid,
            email: decoded.email,
            name: decoded.name ?? null,
            image: decoded.picture ?? null,
            provider: 'firebase',
        };
    } catch {
        return null;
    }
}

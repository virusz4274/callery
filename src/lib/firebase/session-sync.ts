'use client';

import { logger } from '@/lib/logger';

import { signOut, type Auth, type User } from 'firebase/auth';

export const PROFILE_SETUP_RECOVERY_MESSAGE = 'We couldn’t finish setting up your account. Please try again.';

export type SessionSyncResult =
    | {
        ok: true;
        profileEnsureFailed: boolean;
    }
    | {
        ok: false;
        status: number;
        message: string;
        shouldSignOut: boolean;
    };

function shouldSignOutForStatus(status: number): boolean {
    return status === 401 || status === 403 || status === 503;
}

export async function syncFirebaseSession(
    user: User,
    options: {
        auth?: Auth;
        signOutOnFailure?: boolean;
    } = {}
): Promise<SessionSyncResult> {
    const idToken = await user.getIdToken();
    const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok) {
        return {
            ok: true,
            profileEnsureFailed: Boolean(data.profileEnsureFailed),
        };
    }

    const message = response.status === 503
        ? PROFILE_SETUP_RECOVERY_MESSAGE
        : typeof data.error === 'string'
            ? data.error
            : `Session sync failed: ${response.status}`;
    const shouldSignOut = shouldSignOutForStatus(response.status) && options.signOutOnFailure !== false;

    if (shouldSignOut && options.auth) {
        try {
            await signOut(options.auth);
        } catch (signOutError) {
            logger.error('Failed to sign out after session sync error:', signOutError);
        }
    }

    return {
        ok: false,
        status: response.status,
        message,
        shouldSignOut,
    };
}

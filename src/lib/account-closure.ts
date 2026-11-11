export interface AccountClosureInput {
    expectedAuthSubject: string;
    confirmationEmail: string;
}

export interface AccountClosureResult {
    status: 'deleted' | 'cleanup_pending' | 'reauth_required' | 'blocked' | 'error';
    message: string;
}

export const ACCOUNT_CLOSURE_LOGIN_MAX_AGE_MS = 10 * 60 * 1000;

/** A refreshed session is not a new login; use only its original creation time. */
export function hasRecentAccountClosureLogin(createdAt: unknown, now = Date.now()): boolean {
    if (!(createdAt instanceof Date) && typeof createdAt !== 'string') return false;
    const created = createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
    return Number.isFinite(created) && created <= now && now - created <= ACCOUNT_CLOSURE_LOGIN_MAX_AGE_MS;
}

export class AccountClosurePolicyError extends Error {}

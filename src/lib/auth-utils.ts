import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { getSessionUser } from './auth/server';
import { verifyMobileSyncSessionToken } from './mobile-sync-session-token';
import { findUserByAuthSubject } from './db/users';
import type { SessionUser } from './auth/types';

async function activeIdentity(identity: SessionUser | null): Promise<SessionUser | null> {
    if (!identity) return null;
    const profile = await findUserByAuthSubject(identity.subject);
    return profile?.disabled || profile?.softDelete?.isDeleted ? null : identity;
}

export async function getRequestIdentity(request: NextRequest): Promise<SessionUser | null> {
    return activeIdentity(await getSessionUser(request.headers));
}

export async function getUserFromRequest(request: NextRequest): Promise<string | null> {
    return (await getRequestIdentity(request))?.subject ?? null;
}

export async function getAuthSubjectFromSession(): Promise<string | null> {
    return (await activeIdentity(await getSessionUser(await headers())))?.subject ?? null;
}

/** Sync clients may use a short-lived sync token or the instance's own auth. */
export async function getMobileSyncUserFromRequest(request: NextRequest): Promise<string | null> {
    const bearer = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    const sync = bearer ? await verifyMobileSyncSessionToken(bearer) : null;
    const subject = sync?.authSubject ?? await getUserFromRequest(request);
    if (!subject) return null;
    const user = await findUserByAuthSubject(subject);
    return user && !user.disabled && !user.softDelete?.isDeleted ? subject : null;
}

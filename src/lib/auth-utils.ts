import { NextRequest } from 'next/server';
import { cookies, headers } from 'next/headers';
import { authProvider } from './config';
import { verifyIdTokenValue, verifySessionCookieValue } from './auth/firebase';
import { getLocalSessionUser } from './auth/local';
import { verifyMobileSyncSessionToken } from './mobile-sync-session-token';
import { findUserByAuthSubject } from './db/users';
import type { SessionUser } from './auth/types';

async function activeIdentity(identity: SessionUser | null): Promise<SessionUser | null> {
    if (!identity) return null;
    const profile = await findUserByAuthSubject(identity.subject);
    return profile?.disabled || profile?.softDelete?.isDeleted ? null : identity;
}

export async function getRequestIdentity(request: NextRequest): Promise<SessionUser | null> {
    if (authProvider() === 'local') return activeIdentity(await getLocalSessionUser(request.headers));
    const bearer = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (bearer) return activeIdentity(await verifyIdTokenValue(bearer));
    const session = request.cookies.get('session')?.value;
    return activeIdentity(session ? await verifySessionCookieValue(session) : null);
}

export async function getUserFromRequest(request: NextRequest): Promise<string | null> {
    return (await getRequestIdentity(request))?.subject ?? null;
}

export async function getAuthSubjectFromSession(): Promise<string | null> {
    if (authProvider() === 'local') return (await activeIdentity(await getLocalSessionUser(await headers())))?.subject ?? null;
    const session = (await cookies()).get('session')?.value;
    return session ? (await activeIdentity(await verifySessionCookieValue(session)))?.subject ?? null : null;
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

import { createHash } from 'node:crypto';
import { ObjectId, type Db } from 'mongodb';
import type { User } from '@/lib/db/types';
import { ApiError, type Scope } from './contracts';

export const OAUTH_CONNECTIONS = 'integration_oauth_connections';
export const OAUTH_SCOPES = ['openid', 'profile', 'email', 'offline_access', 'recordings:read', 'recordings:upload', 'recordings:download', 'recordings:transcribe'] as const;
export interface OAuthConnection {
    _id: string; owner: string; clientId: string; consentId: string; name: string;
    scopes: string[]; resources: string[]; sessionId: string; createdAt: Date; lastUsedAt?: Date; revokedAt?: Date;
}
export function authUserIds(owner: string) { return ObjectId.isValid(owner) ? [owner, new ObjectId(owner)] : [owner]; }
export function oauthAccountActive(user: User | null, grantedAt: Date): user is User {
    return !!user && !user.disabled && !user.softDelete?.isDeleted && !user.teamInvitationPending &&
        (!user.accessRevokedAt || grantedAt > user.accessRevokedAt);
}

/** The provider owns consent. A separate stable grant identity fences tokens and uploads after disconnect. */
export async function createOAuthTokenClaims(db: Db, input: { user?: { id: string } | null; client: { clientId: string; name?: string | null }; sessionId?: string; scopes: readonly string[]; resources?: string[] }) {
    const owner = input.user?.id, clientId = input.client.clientId;
    if (!owner || typeof clientId !== 'string' || !input.sessionId || !input.resources?.length) throw new ApiError(401, 'unauthorized', 'A user session and resource-bound authorization are required.');
    const user = await db.collection<User>('users').findOne({ authSubject: owner });
    const session = ObjectId.isValid(input.sessionId) ? await db.collection('session').findOne({ _id: new ObjectId(input.sessionId), userId: { $in: authUserIds(owner) }, expiresAt: { $gt: new Date() } }) : null;
    const consent = await db.collection('oauthConsent').findOne({ userId: { $in: authUserIds(owner) }, clientId });
    // Provider consent timestamps have second precision; a fresh session retains the
    // precise authorization boundary after an administrator revokes account access.
    const grantedAt = new Date(Math.max(Number(consent?.createdAt) || 0, Number(session?.createdAt) || 0));
    if (!session || !consent || !oauthAccountActive(user, grantedAt) || input.scopes.some(scope => !consent.scopes?.includes(scope)) || input.resources.some(resource => !consent.resources?.includes(resource))) {
        throw new ApiError(401, 'unauthorized', 'This connection must be authorized again.');
    }
    const id = `oauth:${createHash('sha256').update(`${owner}:${clientId}:${consent._id}`).digest('hex')}`;
    const connections = db.collection<OAuthConnection>(OAUTH_CONNECTIONS);
    await connections.updateOne({ _id: id }, { $setOnInsert: { owner, clientId, consentId: String(consent._id),
        name: input.client.name || 'Connected application', createdAt: grantedAt },
        $set: { scopes: consent.scopes, resources: consent.resources, sessionId: input.sessionId } }, { upsert: true });
    if ((await connections.findOne({ _id: id }))?.revokedAt) throw new ApiError(401, 'unauthorized', 'Connection revoked.');
    return { callery_connection: id };
}

export async function currentOAuthConnection(db: Db, owner: string, id: string): Promise<OAuthConnection | null> {
    const connection = await db.collection<OAuthConnection>(OAUTH_CONNECTIONS).findOne({ _id: id, owner, revokedAt: { $exists: false } });
    if (!connection) return null;
    const consent = await db.collection('oauthConsent').findOne({ _id: new ObjectId(connection.consentId), clientId: connection.clientId, userId: { $in: authUserIds(owner) } });
    const client = await db.collection('oauthClient').findOne({ clientId: connection.clientId, disabled: { $ne: true } });
    const session = connection.sessionId && ObjectId.isValid(connection.sessionId) ? await db.collection('session').findOne({ _id: new ObjectId(connection.sessionId), userId: { $in: authUserIds(owner) }, expiresAt: { $gt: new Date() } }) : null;
    return consent && client && session ? { ...connection, scopes: consent.scopes, resources: consent.resources } : null;
}

export async function revokeOwnerOAuth(db: Db, owner: string) {
    const now = new Date();
    await db.collection<OAuthConnection>(OAUTH_CONNECTIONS).updateMany({ owner }, { $set: { revokedAt: now } });
    for (const name of ['oauthAccessToken', 'oauthRefreshToken']) await db.collection(name).updateMany({ userId: { $in: authUserIds(owner) } }, { $set: { revoked: now } });
    await db.collection('oauthConsent').deleteMany({ userId: { $in: authUserIds(owner) } });
}

export function personalOAuthScopes(scopes: string[]): Scope[] { return scopes.filter((scope): scope is Scope => scope.startsWith('recordings:') && OAUTH_SCOPES.includes(scope as typeof OAUTH_SCOPES[number])); }

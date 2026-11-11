import { ObjectId, type Db } from 'mongodb';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { getConfiguredPublicAppOrigin } from '@/lib/public-url';
import { getAuth } from '@/lib/auth/server';
import { getMongoDb } from '@/lib/mongodb';
import type { User } from '@/lib/db/types';
import { ApiError } from './contracts';
import { authUserIds, currentOAuthConnection, oauthAccountActive, OAUTH_CONNECTIONS, personalOAuthScopes, type OAuthConnection } from './oauth-state';
import type { ApiActor } from './tokens';
import { integrationResource, type IntegrationResource } from './oauth-resource';
export { integrationResource, integrationOAuthChallenge } from './oauth-resource';

export async function authenticateOAuth(secret: string, db: Db, resource: IntegrationResource): Promise<ApiActor> {
    try {
        const auth = await getAuth();
        const keys = await auth.api.getJwks();
        const { payload } = await jwtVerify(secret, createLocalJWKSet(keys), { issuer: `${getConfiguredPublicAppOrigin()}/api/auth`, audience: integrationResource(resource), typ: 'at+jwt', requiredClaims: ['sub', 'iat', 'exp', 'jti', 'client_id', 'sid', 'callery_connection'] });
        if (!payload.sub || typeof payload.callery_connection !== 'string' || typeof payload.client_id !== 'string' || typeof payload.scope !== 'string' || typeof payload.sid !== 'string' || payload.cnf) throw new Error('Invalid access token.');
        const connection = await currentOAuthConnection(db, payload.sub, payload.callery_connection);
        const user = await db.collection<User>('users').findOne({ authSubject: payload.sub });
        if (!connection || connection.clientId !== payload.client_id || !connection.resources.includes(integrationResource(resource)) || !oauthAccountActive(user, connection.createdAt)) throw new Error('Inactive grant.');
        const granted = payload.scope.split(' ');
        if (granted.some(scope => !connection.scopes.includes(scope))) throw new Error('Grant reduced.');
        const session = await db.collection('session').findOne({ _id: new ObjectId(payload.sid), userId: { $in: authUserIds(payload.sub) }, expiresAt: { $gt: new Date() } });
        if (!session) throw new Error('Session ended.');
        const scopes = personalOAuthScopes(granted), expiresAt = new Date(payload.exp! * 1000);
        await db.collection<OAuthConnection>(OAUTH_CONNECTIONS).updateOne({ _id: connection._id }, { $set: { lastUsedAt: new Date() } });
        return { user, token: { _id: connection._id, owner: connection.owner, integrationId: connection._id, name: connection.name,
            scopes, createdAt: connection.createdAt, credentialIssuedAt: connection.createdAt, expiresAt },
            principal: { kind: 'oauth', owner: connection.owner, connectionId: connection._id, credentialId: payload.jti ?? connection._id, scopes, issuedAt: connection.createdAt, expiresAt } };
    } catch { throw new ApiError(401, 'unauthorized', 'OAuth authorization expired, revoked, or invalid.'); }
}

export async function listOAuthConnections(owner: string) {
    return (await (await getMongoDb()).collection<OAuthConnection>(OAUTH_CONNECTIONS).find({ owner }).sort({ createdAt: -1 }).limit(100).toArray()).map(row => ({
        id: row._id, name: row.name, scopes: row.scopes, resources: row.resources, createdAt: row.createdAt.toISOString(), lastUsedAt: row.lastUsedAt?.toISOString() ?? null, revokedAt: row.revokedAt?.toISOString() ?? null,
    }));
}

export async function revokeOAuthConnection(owner: string, id: string) {
    const db = await getMongoDb(), now = new Date();
    const row = await db.collection<OAuthConnection>(OAUTH_CONNECTIONS).findOneAndUpdate({ _id: id, owner, revokedAt: { $exists: false } }, { $set: { revokedAt: now } }, { returnDocument: 'after' });
    if (!row) throw new ApiError(404, 'not_found', 'Active connection not found.');
    await db.collection('oauthConsent').deleteOne({ _id: new ObjectId(row.consentId), clientId: row.clientId, userId: { $in: authUserIds(owner) } });
    for (const name of ['oauthAccessToken', 'oauthRefreshToken']) await db.collection(name).updateMany({ userId: { $in: authUserIds(owner) }, clientId: row.clientId }, { $set: { revoked: now } });
    await db.collection('integration_uploads').updateMany({ owner, integrationId: id, state: { $in: ['initializing', 'uploading'] } }, { $set: { state: 'cancelled', cleanupPending: true } });
}

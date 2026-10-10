import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Db } from 'mongodb';
import { getMongoDb, Collections } from '@/lib/mongodb';
import type { User } from '@/lib/db/types';
import { getTeamSettings } from '@/lib/team-policy';
import { ApiError, TokenSchema, type Scope } from './contracts';
import { IntegrationCollections, integrationDb } from './database';

export interface ApiToken {
    _id: string; owner: string; integrationId: string; name: string; hash: string; prefix: string;
    scopes: Scope[]; createdAt: Date; credentialIssuedAt: Date; expiresAt: Date | null;
    revokedAt?: Date; lastUsedAt?: Date;
}
export interface ApiActor { token: ApiToken; user: User }
export function newCredential() {
    const secret = `vst_${randomBytes(32).toString('base64url')}`;
    return { secret, hash: createHash('sha256').update(secret).digest('hex'), prefix: secret.slice(0, 12) };
}
export function tokenResponse(token: ApiToken) {
    return { id: token._id, name: token.name, prefix: token.prefix, scopes: token.scopes, createdAt: token.createdAt.toISOString(), expiresAt: token.expiresAt?.toISOString() ?? null, revokedAt: token.revokedAt?.toISOString() ?? null, lastUsedAt: token.lastUsedAt?.toISOString() ?? null };
}
export function tokenIsActive(token: ApiToken, user: User | null, now = new Date()) {
    return !!user && !user.disabled && !user.softDelete?.isDeleted && !user.teamInvitationPending && !token.revokedAt &&
        (!token.expiresAt || token.expiresAt > now) && (!user.accessRevokedAt || token.credentialIssuedAt > user.accessRevokedAt);
}
export async function authenticateApi(headers: Headers, database?: Db): Promise<ApiActor> {
    const secret = headers.get('authorization')?.match(/^Bearer (vst_[A-Za-z0-9_-]{43})$/i)?.[1];
    if (!secret) throw new ApiError(401, 'unauthorized', 'A valid API token is required.');
    const db = database || await integrationDb();
    const hash = createHash('sha256').update(secret).digest('hex');
    const token = await db.collection<ApiToken>(IntegrationCollections.tokens).findOne({ hash });
    const user = token ? await db.collection<User>(Collections.USERS).findOne({ authSubject: token.owner }) : null;
    if (!token || !tokenIsActive(token, user) || !timingSafeEqual(Buffer.from(hash), Buffer.from(token.hash))) throw new ApiError(401, 'unauthorized', 'API token expired, revoked, or invalid.');
    await db.collection<ApiToken>(IntegrationCollections.tokens).updateOne({ _id: token._id, hash, $or: [{ lastUsedAt: { $exists: false } }, { lastUsedAt: { $lt: new Date(Date.now() - 60_000) } }] }, { $set: { lastUsedAt: new Date() } });
    return { token, user: user! };
}
export function requireScope(actor: ApiActor, scope: Scope) {
    if (!actor.token.scopes.includes(scope)) throw new ApiError(403, 'insufficient_scope', `Required permission: ${scope}.`);
}
export async function companyScope(actor: ApiActor, scope: 'company:recordings:read' | 'company:recordings:download') {
    return actor.token.scopes.includes(scope) && actor.user.role === 'admin' && (await getTeamSettings()).enabled;
}
export async function createApiToken(owner: string, raw: unknown, database?: Db) {
    const parsed = TokenSchema.safeParse(raw);
    if (!parsed.success) throw new ApiError(400, 'invalid_request', 'Invalid token name, permissions, or expiration.');
    const db = database || await integrationDb();
    const user = await db.collection<User>(Collections.USERS).findOne({ authSubject: owner });
    if (!user || user.disabled || user.softDelete?.isDeleted || user.teamInvitationPending) throw new ApiError(401, 'unauthorized', 'Account unavailable.');
    if (parsed.data.scopes.some(scope => scope.startsWith('company:')) && (user.role !== 'admin' || !(await getTeamSettings(db)).enabled)) throw new ApiError(403, 'forbidden', 'Company permissions require an active company administrator.');
    const now = new Date();
    const expiresAt = parsed.data.expiresAt === null ? null : new Date(parsed.data.expiresAt || now.getTime() + 90 * 86400_000);
    if (expiresAt && expiresAt <= now) throw new ApiError(400, 'invalid_request', 'Expiration must be in the future.');
    const credential = newCredential();
    const token: ApiToken = { _id: randomUUID(), owner, integrationId: randomUUID(), name: parsed.data.name, scopes: [...new Set(parsed.data.scopes)], hash: credential.hash, prefix: credential.prefix, createdAt: now, credentialIssuedAt: now, expiresAt };
    await db.collection<ApiToken>(IntegrationCollections.tokens).insertOne(token);
    await auditToken(db, owner, 'created', token._id);
    return { ...tokenResponse(token), secret: credential.secret };
}
export async function auditToken(db: Db, owner: string, event: string, tokenId: string) {
    const user = await db.collection<User>(Collections.USERS).findOne({ authSubject: owner });
    await db.collection(Collections.ADMIN_LOGS).insertOne({ action: `INTEGRATION_TOKEN_${event.toUpperCase()}`, adminId: owner, adminEmail: user?.email ?? '', targetId: tokenId, targetType: 'INTEGRATION', details: { tokenId }, createdAt: new Date() });
}
export async function listApiTokens(owner: string) {
    return (await (await integrationDb()).collection<ApiToken>(IntegrationCollections.tokens).find({ owner }).sort({ createdAt: -1 }).limit(100).toArray()).map(tokenResponse);
}
export async function changeApiToken(owner: string, id: string, rotate: boolean) {
    const db = await integrationDb();
    const credential = newCredential();
    const token = await db.collection<ApiToken>(IntegrationCollections.tokens).findOneAndUpdate({ _id: id, owner, revokedAt: { $exists: false }, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }, { $set: rotate ? { hash: credential.hash, prefix: credential.prefix, credentialIssuedAt: new Date() } : { revokedAt: new Date() } }, { returnDocument: 'after' });
    if (!token) throw new ApiError(404, 'not_found', 'Active token not found.');
    if (!rotate) await db.collection(IntegrationCollections.uploads).updateMany({ owner, integrationId: token.integrationId, state: { $in: ['initializing', 'uploading'] } }, { $set: { state: 'cancelled', cleanupPending: true } });
    await auditToken(db, owner, rotate ? 'rotated' : 'revoked', id);
    return { ...tokenResponse(token), ...(rotate ? { secret: credential.secret } : {}) };
}
export async function activeIntegration(owner: string, integrationId: string) {
    const db = await getMongoDb();
    const token = await db.collection<ApiToken>(IntegrationCollections.tokens).findOne({ owner, integrationId, revokedAt: { $exists: false } });
    const user = await db.collection<User>(Collections.USERS).findOne({ authSubject: owner });
    return token && tokenIsActive(token, user) ? user : null;
}

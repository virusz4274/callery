import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { ObjectId, type Db } from 'mongodb';
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { createOAuthTokenClaims, OAUTH_CONNECTIONS, revokeOwnerOAuth } from './oauth-state';

type Row = Record<string, unknown>;
function copy<T>(value: T): T {
    if (value instanceof ObjectId) return new ObjectId(value) as T;
    if (value instanceof Date) return new Date(value) as T;
    if (Array.isArray(value)) return value.map(copy) as T;
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) as T;
    return value;
}
function equal(left: unknown, right: unknown): boolean {
    if (left instanceof ObjectId || right instanceof ObjectId) return String(left) === String(right);
    return left instanceof Date && right instanceof Date ? +left === +right : left === right;
}
function matches(row: Row, query: Row): boolean {
    return Object.entries(query).every(([key, expected]) => {
        const actual = row[key];
        if (expected && typeof expected === 'object' && !(expected instanceof ObjectId) && !(expected instanceof Date)) return Object.entries(expected as Row).every(([operator, value]) => {
            if (operator === '$in') return (value as unknown[]).some(item => equal(actual, item));
            if (operator === '$exists') return (actual !== undefined) === value;
            if (operator === '$gt') return Number(actual) > Number(value);
            if (operator === '$ne') return !equal(actual, value);
            throw new Error(`Unsupported test operator ${operator}`);
        });
        return equal(actual, expected);
    });
}
class Rows {
    values: Row[] = [];
    async findOne(query: Row) { return copy(this.values.find(row => matches(row, query)) ?? null); }
    async updateOne(query: Row, update: Row, options: { upsert?: boolean } = {}) {
        let row = this.values.find(value => matches(value, query));
        const inserted = !row;
        if (!row && options.upsert) { row = copy(query); this.values.push(row); }
        if (row) Object.assign(row, copy(update.$set as Row), inserted ? copy(update.$setOnInsert as Row) : {});
        return { matchedCount: row ? 1 : 0 };
    }
    async updateMany(query: Row, update: Row) {
        const rows = this.values.filter(row => matches(row, query));
        rows.forEach(row => Object.assign(row, copy(update.$set as Row)));
        return { matchedCount: rows.length };
    }
    async findOneAndUpdate(query: Row, update: Row) {
        const row = this.values.find(value => matches(value, query));
        if (!row) return null;
        Object.assign(row, copy(update.$set as Row));
        return copy(row);
    }
    async deleteOne(query: Row) { const index = this.values.findIndex(row => matches(row, query)); if (index >= 0) this.values.splice(index, 1); }
    async deleteMany(query: Row) { this.values = this.values.filter(row => !matches(row, query)); }
}
class MemoryDb {
    tables = new Map<string, Rows>();
    collection(name: string) { let rows = this.tables.get(name); if (!rows) { rows = new Rows(); this.tables.set(name, rows); } return rows; }
    asDb() { return this as unknown as Db; }
}

const issuer = 'https://app.example.com/api/auth';
const audience = 'https://app.example.com/mcp/v1';
const { privateKey, publicKey } = await generateKeyPair('ES256');
const publicJwk = { ...await exportJWK(publicKey), kid: 'oauth-test-key', alg: 'ES256' };
const stateKey = Symbol.for('vosift.test.oauth');
const state = { db: new MemoryDb(), jwks: { keys: [publicJwk] } };
Object.assign(globalThis, { [stateKey]: state });
registerHooks({ resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith('/integrations/oauth.ts')) {
        const global = "globalThis[Symbol.for('vosift.test.oauth')]";
        const code = specifier === '@/lib/auth/server' ? `export async function getAuth(){return {api:{getJwks:async()=>${global}.jwks}};}`
            : specifier === '@/lib/mongodb' ? `export async function getMongoDb(){return ${global}.db.asDb();}`
                : specifier === '@/lib/public-url' ? "export function getConfiguredPublicAppOrigin(){return 'https://app.example.com';}" : undefined;
        if (code) return { url: `data:text/javascript,${encodeURIComponent(code)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
} });
const { authenticateOAuth, revokeOAuthConnection } = await import('./oauth');

function fixture() {
    state.db = new MemoryDb();
    const owner = new ObjectId().toString(), sessionId = new ObjectId(), consentId = new ObjectId();
    const createdAt = new Date(Date.now() - 60_000);
    state.db.collection('users').values.push({ _id: new ObjectId(), authSubject: owner });
    state.db.collection('session').values.push({ _id: sessionId, userId: new ObjectId(owner), expiresAt: new Date(Date.now() + 60_000) });
    state.db.collection('oauthConsent').values.push({ _id: consentId, userId: new ObjectId(owner), clientId: 'client-one', scopes: ['recordings:read', 'offline_access'], resources: [audience], createdAt });
    state.db.collection('oauthClient').values.push({ _id: new ObjectId(), clientId: 'client-one', name: 'Test CRM', disabled: false });
    return { owner, sessionId: sessionId.toString(), consentId, createdAt };
}

async function grant() {
    const values = fixture();
    const input = { user: { id: values.owner }, client: { clientId: 'client-one', name: 'Test CRM' }, sessionId: values.sessionId, scopes: ['recordings:read', 'offline_access'], resources: [audience] };
    const claims = await createOAuthTokenClaims(state.db.asDb(), input);
    return { ...values, input, id: claims.callery_connection };
}
async function accessToken(values: { owner: string; sessionId: string; id: string }, patch: JWTPayload = {}, header = 'at+jwt') {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ sub: values.owner, client_id: 'client-one', scope: 'recordings:read offline_access', sid: values.sessionId, callery_connection: values.id, iss: issuer, aud: audience, iat: now, exp: now + 900, jti: new ObjectId().toString(), ...patch })
        .setProtectedHeader({ alg: 'ES256', kid: 'oauth-test-key', typ: header }).sign(privateKey);
}

test('a refresh keeps stable OAuth connection and upload identity; access is personal and resource-bound', async () => {
    const values = await grant();
    const refreshed = await createOAuthTokenClaims(state.db.asDb(), values.input);
    assert.equal(refreshed.callery_connection, values.id);
    assert.equal(state.db.collection(OAUTH_CONNECTIONS).values.length, 1);
    const actor = await authenticateOAuth(await accessToken(values), state.db.asDb(), 'mcp');
    assert.equal(actor.principal?.connectionId, values.id);
    assert.equal(actor.token.owner, values.owner);
    assert.deepEqual(actor.token.scopes, ['recordings:read']);
    assert.ok(state.db.collection(OAUTH_CONNECTIONS).values[0].lastUsedAt instanceof Date);
    await assert.rejects(authenticateOAuth(await accessToken(values), state.db.asDb(), 'api'), /expired, revoked, or invalid/);
});

test('OAuth rejects wrong issuer, token type, client, subject, scope, session, expiry, and proof-bound tokens', async () => {
    const values = await grant();
    for (const patch of [{ iss: 'https://other.example/api/auth' }, { client_id: 'other-client' }, { sub: new ObjectId().toString() },
        { scope: 'recordings:read recordings:upload' }, { sid: new ObjectId().toString() }, { exp: 1 }, { cnf: { jkt: 'proof-required' } },
        { callery_connection: 'another-connection' }, { exp: undefined }, { iat: undefined }, { jti: undefined }]) await assert.rejects(authenticateOAuth(await accessToken(values, patch), state.db.asDb(), 'mcp'), /expired, revoked, or invalid/);
    await assert.rejects(authenticateOAuth(await accessToken(values, {}, 'JWT'), state.db.asDb(), 'mcp'), /expired, revoked, or invalid/);
});

test('current account and consent state fence previously issued OAuth access tokens', async () => {
    for (const change of ['disabled', 'deleted', 'invitation', 'access-revoked', 'consent-deleted', 'scope-reduced', 'connection-revoked', 'session-ended', 'client-disabled']) {
        const values = await grant(); const token = await accessToken(values);
        const user = state.db.collection('users').values[0];
        if (change === 'disabled') user.disabled = true;
        if (change === 'deleted') user.softDelete = { isDeleted: true };
        if (change === 'invitation') user.teamInvitationPending = true;
        if (change === 'access-revoked') user.accessRevokedAt = new Date();
        if (change === 'consent-deleted') state.db.collection('oauthConsent').values = [];
        if (change === 'scope-reduced') state.db.collection('oauthConsent').values[0].scopes = [];
        if (change === 'connection-revoked') state.db.collection(OAUTH_CONNECTIONS).values[0].revokedAt = new Date();
        if (change === 'session-ended') state.db.collection('session').values = [];
        if (change === 'client-disabled') state.db.collection('oauthClient').values[0].disabled = true;
        await assert.rejects(authenticateOAuth(token, state.db.asDb(), 'mcp'), /expired, revoked, or invalid/, change);
    }
});

test('disconnect revokes only the owner connection and its unfinished uploads; refresh cannot revive it', async () => {
    const values = await grant(); const token = await accessToken(values);
    state.db.collection('integration_uploads').values.push({ _id: 'owned-upload', owner: values.owner, integrationId: values.id, state: 'uploading' }, { _id: 'other-upload', owner: values.owner, integrationId: 'another-key', state: 'uploading' });
    await assert.rejects(revokeOAuthConnection('someone-else', values.id), /not found/);
    await revokeOAuthConnection(values.owner, values.id);
    assert.equal(state.db.collection('integration_uploads').values[0].state, 'cancelled');
    assert.equal(state.db.collection('integration_uploads').values[1].state, 'uploading');
    await assert.rejects(authenticateOAuth(token, state.db.asDb(), 'mcp'), /expired, revoked, or invalid/);
    await assert.rejects(createOAuthTokenClaims(state.db.asDb(), values.input), /authorized again/);
});

test('account-wide OAuth revocation fences all existing grants', async () => {
    const values = await grant(); const token = await accessToken(values);
    await revokeOwnerOAuth(state.db.asDb(), values.owner);
    assert.equal(state.db.collection('oauthConsent').values.length, 0);
    assert.ok(state.db.collection(OAUTH_CONNECTIONS).values[0].revokedAt instanceof Date);
    await assert.rejects(authenticateOAuth(token, state.db.asDb(), 'mcp'), /expired, revoked, or invalid/);
});

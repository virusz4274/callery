import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { createAuth } from './server';
import { getMongoClient, getMongoDb, Collections } from '@/lib/mongodb';
import { createCoreIndexes } from '@/lib/db/init/indexes';
import { seedPlans, seedSystemSettings } from '@/lib/db/init/seed';
import { activeIntegration, authenticateApi } from '@/lib/integrations/tokens';
import { listOAuthConnections, revokeOAuthConnection } from '@/lib/integrations/oauth';
import { createUpload, ownedUpload, type UploadSession } from '@/lib/integrations/uploads';
import { ingestionStorage } from '@/lib/integrations/storage';
import { UploadSchema, fingerprint } from '@/lib/integrations/contracts';
import { revokeUserSessions } from '@/lib/team-policy';

/** Real provider/adapter coverage; creates and drops only a uniquely named test database. */
test('OAuth authorization, resource binding, refresh and disconnect use the actual provider', { skip: !process.env.VOSIFT_TEST_MONGODB_URI, timeout: 90_000 }, async t => {
    const uri = new URL(process.env.VOSIFT_TEST_MONGODB_URI!);
    uri.pathname = `/vt_oauth_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
    process.env.MONGODB_URI = uri.toString();
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'false';
    process.env.EMAIL_PROVIDER = 'none';
    const db = await getMongoDb(), client = await getMongoClient();
    const origin = process.env.NEXT_PUBLIC_APP_URL!, issuer = `${origin}/api/auth`, resource = `${origin}/api/v1`;
    const auth = createAuth(db);
    t.mock.method(ingestionStorage, 'create', async () => randomUUID());
    t.mock.method(ingestionStorage, 'abort', async () => {});
    const json = (path: string, body: unknown, session?: string) => auth.handler(new Request(`${issuer}${path}`, { method: 'POST', headers: {
        origin, 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session}` } : {}),
    }, body: JSON.stringify(body) }));
    const form = (body: Record<string, string>) => auth.handler(new Request(`${issuer}/oauth2/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) }));
    try {
        await createCoreIndexes(db, Collections); await seedPlans(db, Collections); await seedSystemSettings(db, Collections);
        const signup = await json('/sign-up/email', { name: 'OAuth fixture', email: 'oauth@test.invalid', password: 'FixturePassword123!' });
        assert.equal(signup.status, 200);
        const account = await signup.json();
        const registered = await json('/oauth2/register', { client_name: 'Fixture CRM', redirect_uris: ['https://client.example.com/callback'], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] });
        assert.equal(registered.status, 201, await registered.clone().text());
        const registeredClient = await registered.json();
        const verifier = randomBytes(32).toString('base64url');
        async function authorize(scope = 'recordings:read offline_access') {
            const query = new URLSearchParams({ client_id: registeredClient.client_id, redirect_uri: 'https://client.example.com/callback', response_type: 'code', scope, resource,
                code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state: 'test-state', prompt: 'consent' });
            const response = await auth.handler(new Request(`${issuer}/oauth2/authorize?${query}`, { headers: { authorization: `Bearer ${account.token}` } }));
            assert.equal(response.status, 302, await response.clone().text());
            const consentUrl = new URL(response.headers.get('location')!, origin);
            assert.equal(consentUrl.pathname, '/oauth/consent');
            const consent = await json('/oauth2/consent', { accept: true, oauth_query: consentUrl.search.slice(1) }, account.token);
            assert.equal(consent.status, 200, await consent.clone().text());
            const callback = new URL((await consent.json()).url);
            assert.equal(callback.searchParams.get('state'), 'test-state');
            const result = await form({ grant_type: 'authorization_code', client_id: registeredClient.client_id, code: callback.searchParams.get('code')!, redirect_uri: 'https://client.example.com/callback', code_verifier: verifier, resource });
            assert.equal(result.status, 200, await result.clone().text());
            return result.json();
        }
        const issued = await authorize();
        assert.equal(issued.expires_in, 900); assert.ok(issued.refresh_token);
        const actor = await authenticateApi(new Headers({ authorization: `Bearer ${issued.access_token}` }), db);
        assert.equal(actor.principal?.kind, 'oauth'); assert.equal(actor.token.owner, account.user.id);
        await assert.rejects(authenticateApi(new Headers({ authorization: `Bearer ${issued.access_token}` }), db, 'mcp'));
        const refreshed = await form({ grant_type: 'refresh_token', client_id: registeredClient.client_id, refresh_token: issued.refresh_token, resource });
        assert.equal(refreshed.status, 200, await refreshed.clone().text());
        const rotated = await refreshed.json();
        assert.notEqual(rotated.refresh_token, issued.refresh_token);
        const after = await authenticateApi(new Headers({ authorization: `Bearer ${rotated.access_token}` }), db);
        assert.equal(after.token.integrationId, actor.token.integrationId);
        const connections = await listOAuthConnections(account.user.id);
        assert.equal(connections.length, 1); assert.equal(connections[0].name, 'Fixture CRM');
        await revokeOAuthConnection(account.user.id, actor.token.integrationId);
        await assert.rejects(authenticateApi(new Headers({ authorization: `Bearer ${rotated.access_token}` }), db));
        const revokedRefresh = await form({ grant_type: 'refresh_token', client_id: registeredClient.client_id, refresh_token: rotated.refresh_token, resource });
        assert.notEqual(revokedRefresh.status, 200);
        const reauthorized = await authorize('recordings:read recordings:upload offline_access');
        const newActor = await authenticateApi(new Headers({ authorization: `Bearer ${reauthorized.access_token}` }), db);
        assert.notEqual(newActor.token.integrationId, actor.token.integrationId);
        await assert.rejects(authenticateApi(new Headers({ authorization: `Bearer ${issued.access_token}` }), db));
        const input = UploadSchema.parse({ fileName: 'oauth-call.wav', fileSize: 16044, source: 'fixture-crm', externalId: 'call-1' });
        const upload = await createUpload(newActor, input, fingerprint('oauth-upload'));
        assert.ok(await activeIntegration(account.user.id, newActor.token.integrationId));
        await db.collection('oauthClient').updateOne({ clientId: registeredClient.client_id }, { $set: { disabled: true } });
        assert.equal(await activeIntegration(account.user.id, newActor.token.integrationId), null);
        await db.collection('oauthClient').updateOne({ clientId: registeredClient.client_id }, { $set: { disabled: false } });
        const refreshedUpload = await form({ grant_type: 'refresh_token', client_id: registeredClient.client_id, refresh_token: reauthorized.refresh_token, resource });
        assert.equal(refreshedUpload.status, 200);
        const refreshedActor = await authenticateApi(new Headers({ authorization: `Bearer ${(await refreshedUpload.json()).access_token}` }), db);
        assert.equal((await ownedUpload(refreshedActor, upload._id))._id, upload._id);
        assert.equal((await createUpload(refreshedActor, input, fingerprint('oauth-upload')))._id, upload._id);
        await revokeOAuthConnection(account.user.id, newActor.token.integrationId);
        assert.equal((await db.collection<UploadSession>('integration_uploads').findOne({ _id: upload._id }))?.state, 'cancelled');
        const finalGrant = await authorize();
        await db.collection(Collections.USERS).updateOne({ authSubject: account.user.id }, { $set: { disabled: true } });
        await assert.rejects(authenticateApi(new Headers({ authorization: `Bearer ${finalGrant.access_token}` }), db));
        await db.collection(Collections.USERS).updateOne({ authSubject: account.user.id }, { $set: { disabled: false, accessRevokedAt: new Date() } });
        await revokeUserSessions(account.user.id, db);
        const signedIn = await json('/sign-in/email', { email: 'oauth@test.invalid', password: 'FixturePassword123!' });
        assert.equal(signedIn.status, 200);
        account.token = (await signedIn.json()).token;
        const restored = await authorize();
        assert.ok(await authenticateApi(new Headers({ authorization: `Bearer ${restored.access_token}` }), db));
    } finally { await db.dropDatabase(); await client.close(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { Collections, getMongoClient, getMongoDb } from '@/lib/mongodb';
import { ensureUserProfile } from '@/lib/db/users/ensure-profile';
import { seedPlans, seedSystemSettings } from '@/lib/db/init/seed';
import { createApiToken, changeApiToken } from './tokens';
import { IntegrationCollections } from './database';

// Run against a separately started Next process and its isolated database.
// Explicit loopback checks prevent accidentally exercising the shared site.
test('running v1 API enforces bearer scopes, privacy, CORS and retry contracts', {
    skip: !process.env.VOSIFT_TEST_API_BASE_URL || !process.env.VOSIFT_TEST_API_MONGODB_URI,
}, async () => {
    const base = new URL(process.env.VOSIFT_TEST_API_BASE_URL!);
    const uri = new URL(process.env.VOSIFT_TEST_API_MONGODB_URI!);
    assert.ok(['127.0.0.1', 'localhost'].includes(base.hostname));
    assert.ok(['127.0.0.1', 'localhost'].includes(uri.hostname));
    assert.ok(uri.pathname.startsWith('/vosift_api_'));
    process.env.MONGODB_URI = uri.toString();
    const db = await getMongoDb(); const client = await getMongoClient();
    const owner = new ObjectId().toString(); const other = new ObjectId().toString();
    const call = (path: string, token?: string, init: RequestInit = {}) => fetch(new URL(`/api/v1${path}`, base), {
        ...init, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    });
    try {
        await seedPlans(db, Collections); await seedSystemSettings(db, Collections);
        await ensureUserProfile(owner, 'http-owner@test.invalid'); await ensureUserProfile(other, 'http-other@test.invalid');
        const token = await createApiToken(owner, { name: 'HTTP test', scopes: ['recordings:upload', 'recordings:read', 'recordings:download'] }, db);
        const otherToken = await createApiToken(other, { name: 'Other HTTP test', scopes: ['recordings:upload'] }, db);
        const now = new Date(); const id = new ObjectId();
        await db.collection(Collections.RECORDINGS).insertOne({ _id: id, authSubject: owner, contactId: null, contactName: null, phoneNumber: '', fileName: 'api.wav', standardizedDisplayName: 'API test', r2Key: 'private-storage-key', fileSize: 100, mimeType: 'audio/wav', duration: 1, recordedAt: now, createdAt: now, updatedAt: now, transcriptionStatus: 'pending', tags: [], isArchived: false, isStarred: false, summaryEmbedding: [42], externalTranscriptionId: 'private-provider-id', fullTranscript: [{ text: 'Test transcript' }] });
        const capabilities = await call('/capabilities'); assert.equal(capabilities.status, 200); assert.equal((await capabilities.json()).data.apiVersion, 'v1');
        const contract = await call('/openapi.json'); assert.equal((await contract.json()).openapi, '3.1.0');
        const preflight = await call('/recordings', undefined, { method: 'OPTIONS', headers: { Origin: 'https://crm.test', 'Access-Control-Request-Method': 'POST' } });
        assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), '*'); assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'), null);
        const anonymous = await call('/me', undefined, { headers: { Cookie: 'better-auth.session_token=browser-cookie' } });
        assert.equal(anonymous.status, 401); assert.equal((await anonymous.json()).error.code, 'unauthorized');
        assert.equal((await call('/recordings', otherToken.secret)).status, 403);
        assert.equal((await call(`/recordings/${id}`, otherToken.secret)).status, 403);
        const detail = await call(`/recordings/${id}`, token.secret); assert.equal(detail.status, 200);
        assert.equal(detail.headers.get('Cache-Control'), 'no-store');
        const body = await detail.json(); assert.equal(body.requestId, detail.headers.get('X-Request-Id')); assert.equal(body.data.transcript[0].text, 'Test transcript');
        for (const forbidden of ['authSubject', 'r2Key', 'summaryEmbedding', 'externalTranscriptionId']) assert.ok(!(forbidden in body.data));
        const list = await call('/recordings?limit=1', token.secret); assert.equal((await list.json()).data.recordings[0].id, id.toString());
        assert.equal((await call('/recordings?limit=101', token.secret)).status, 400);
        assert.equal((await call(`/recordings/${id}/transcribe`, token.secret, { method: 'POST', body: '{}' })).status, 403);
        assert.equal((await call('/uploads', token.secret, { method: 'POST', body: '{invalid' })).status, 400);
        assert.equal((await call('/uploads', token.secret, { method: 'POST', body: JSON.stringify({ fileName: 'new.wav', fileSize: 100 }) })).status, 400);
        const download = await call(`/recordings/${id}/download`, token.secret); const signed = await download.json();
        assert.equal(download.status, 200); assert.equal(new URL(signed.data.url).searchParams.get('X-Amz-Expires'), '300');
        const rotated = await changeApiToken(owner, token.id, true);
        assert.equal((await call('/me', token.secret)).status, 401); assert.equal((await call('/me', rotated.secret)).status, 200);
        await changeApiToken(owner, token.id, false); assert.equal((await call('/me', rotated.secret)).status, 401);
    } finally {
        for (const collection of [Collections.USERS, Collections.RECORDINGS]) await db.collection(collection).deleteMany({ authSubject: { $in: [owner, other] } });
        await db.collection(IntegrationCollections.tokens).deleteMany({ owner: { $in: [owner, other] } });
        await db.collection(Collections.ADMIN_LOGS).deleteMany({ adminId: { $in: [owner, other] } });
        await client.close();
    }
});

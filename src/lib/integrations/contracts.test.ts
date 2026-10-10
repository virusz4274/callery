import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, UploadSchema, TokenSchema, fingerprint, idempotencyKey } from './contracts';
import { newCredential, tokenIsActive, tokenResponse, type ApiToken } from './tokens';
import { recordingResponse } from './recordings';
import { ObjectId } from 'mongodb';
import type { Recording, User } from '@/lib/db/types';
import { openApiDocument } from './openapi';
import { jsonBody, apiHandler } from './http';
import { Readable } from 'node:stream';
import { getStorageClient } from '@/lib/r2';
import { ingestionStorage } from './storage';

test('upload metadata requires timezone and source for external IDs, and bounds metadata', () => {
    const base = { fileName: 'call.wav', fileSize: 44 };
    assert.ok(UploadSchema.safeParse({ ...base, recordedAt: '2026-10-09T12:00:00+05:30', source: 'crm', externalId: 'abc', metadata: { deal: 42 } }).success);
    for (const invalid of [{ fileSize: 1.5 }, { recordedAt: '2026-10-09T12:00:00' }, { externalId: 'abc' }, { metadata: { huge: 'x'.repeat(17000) } }, { metadata: { a: { b: { c: { d: { e: {} } } } } } }, { owner: 'other' }]) assert.equal(UploadSchema.safeParse({ ...base, ...invalid }).success, false);
    assert.equal(TokenSchema.safeParse({ name: 'CRM', scopes: ['admin'] }).success, false);
});
test('idempotency fingerprints ignore JSON field order but include values', () => {
    assert.equal(fingerprint({ b: 2, a: { y: 1, x: 2 } }), fingerprint({ a: { x: 2, y: 1 }, b: 2 }));
    assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }));
    assert.throws(() => idempotencyKey(new Headers()), ApiError);
    assert.match(idempotencyKey(new Headers({ 'Idempotency-Key': 'one-upload' })), /^[a-f\d]{64}$/);
});
test('credentials are random, non-recoverable through DTOs, and obey account revocation', () => {
    const one = newCredential(); const two = newCredential();
    assert.match(one.secret, /^vst_[A-Za-z0-9_-]{43}$/); assert.notEqual(one.secret, two.secret);
    assert.notEqual(one.hash, one.secret);
    const now = new Date(); const token: ApiToken = { _id: 'token', owner: 'owner', integrationId: 'client', name: 'Sync', hash: one.hash, prefix: one.prefix, scopes: ['recordings:upload'], createdAt: now, credentialIssuedAt: now, expiresAt: new Date(now.getTime() + 1000) };
    const user = { authSubject: 'owner' } as User;
    assert.ok(tokenIsActive(token, user, now));
    assert.equal(tokenIsActive(token, null, now), false);
    for (const fields of [{ disabled: true }, { teamInvitationPending: true }, { softDelete: { isDeleted: true } }, { accessRevokedAt: now }]) assert.equal(tokenIsActive(token, { ...user, ...fields } as User, now), false);
    assert.equal(tokenIsActive({ ...token, revokedAt: now }, user, now), false);
    assert.equal(tokenIsActive(token, user, new Date(now.getTime() + 2000)), false);
    const json = JSON.stringify(tokenResponse(token)); assert.ok(!json.includes(one.hash)); assert.ok(!json.includes(one.secret)); assert.ok(!json.includes('integrationId'));
});
test('recording DTO excludes secrets and omits transcripts from lists', () => {
    const date = new Date();
    const recording = { _id: new ObjectId(), authSubject: 'private-owner', r2Key: 'private/key', summaryEmbedding: [1], externalTranscriptionId: 'provider-private', fileName: 'a.wav', recordedAt: date, createdAt: date, updatedAt: date, fullTranscript: [{ text: 'hello' }] } as unknown as Recording;
    const list = JSON.stringify(recordingResponse(recording));
    for (const field of ['authSubject', 'r2Key', 'summaryEmbedding', 'externalTranscriptionId', 'hello']) assert.ok(!list.includes(field), field);
    assert.ok(JSON.stringify(recordingResponse(recording, true)).includes('hello'));
});
test('bounded JSON and typed errors provide actionable status without leaking internals', async () => {
    const invalid = await apiHandler(async () => { await jsonBody(new Request('https://app.test/api', { method: 'POST', body: '{oops' }), UploadSchema); return new Response(); });
    assert.equal(invalid.status, 400); assert.equal((await invalid.json()).error.code, 'invalid_json');
    const huge = await apiHandler(async () => { await jsonBody(new Request('https://app.test/api', { method: 'POST', body: 'x'.repeat(65537) }), UploadSchema); return new Response(); });
    assert.equal(huge.status, 413);
    const limit = await apiHandler(async () => { throw new ApiError(429, 'rate_limited', 'Retry later', 3); });
    assert.equal(limit.headers.get('Retry-After'), '3'); assert.equal(limit.headers.get('Cache-Control'), 'no-store'); assert.ok(limit.headers.get('X-Request-Id'));
});
test('OpenAPI documents every implemented public operation and valid schema references', () => {
    const document = openApiDocument(); assert.equal(document.openapi, '3.1.0');
    for (const path of ['/capabilities', '/me', '/uploads', '/uploads/{id}', '/uploads/{id}/parts', '/uploads/{id}/complete', '/recordings', '/recordings/{id}', '/recordings/{id}/download', '/recordings/{id}/transcribe', '/openapi.json']) assert.ok(path in document.paths, path);
    const serialized = JSON.stringify(document);
    for (const match of serialized.matchAll(/#\/components\/schemas\/([^"\s]+)/g)) assert.ok(match[1] in document.components.schemas, match[1]);
});

test('audio validation distinguishes an interrupted storage read from invalid content', async t => {
    const client = getStorageClient();
    const send = t.mock.method(client, 'send', async () => ({ Body: Readable.from((async function* () {
        yield Buffer.from('RIFF'); throw new Error('connection interrupted');
    })()) }));
    await assert.rejects(ingestionStorage.validate('test', 'audio/wav', 100), (error: unknown) => error instanceof ApiError && error.status === 503);
    send.mock.mockImplementation(async () => ({ Body: Readable.from(Buffer.from('invalid audio')) }));
    await assert.rejects(ingestionStorage.validate('test', 'audio/wav', 13), (error: unknown) => error instanceof ApiError && error.status === 400);
});

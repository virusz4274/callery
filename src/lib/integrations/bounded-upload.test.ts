import test from 'node:test';
import assert from 'node:assert/strict';
import type { Db } from 'mongodb';
import { streamBoundedUpload } from './bounded-upload';
import { ingestionStorage } from './storage';
import { expectedPartLength, requireSignedContentLength } from './upload-policy';
import { PART_BYTES } from './contracts';
import type { UploadSession } from './uploads';
import { userFixture } from '@/lib/stripe/test-support';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

test('a signed upload must bind its content length and every part stays inside the reservation', () => {
    assert.equal(expectedPartLength(PART_BYTES + 123, 2), 123);
    assert.throws(() => expectedPartLength(PART_BYTES + 123, 3));
    assert.throws(() => expectedPartLength(10, 1.5));
    assert.throws(() => requireSignedContentLength('https://bucket.example/upload?X-Amz-SignedHeaders=host'));
    assert.ok(requireSignedContentLength('https://bucket.example/upload?X-Amz-SignedHeaders=content-length%3Bhost'));
});
test('the installed S3 signer binds different reserved lengths into different signatures', async () => {
    const client = new S3Client({ region: 'auto', endpoint: 'https://example.r2.cloudflarestorage.com', credentials: { accessKeyId: 'fixture', secretAccessKey: 'fixture-secret' } });
    try {
        const sign = (length: number) => getSignedUrl(client, new PutObjectCommand({ Bucket: 'isolated-test', Key: '_staging/fixture/object', ContentLength: length }), { signableHeaders: new Set(['content-length']), signingDate: new Date('2026-10-20'), expiresIn: 900 });
        const first = requireSignedContentLength(await sign(4)), second = requireSignedContentLength(await sign(5));
        assert.notEqual(new URL(first).searchParams.get('X-Amz-Signature'), new URL(second).searchParams.get('X-Amz-Signature'));
    } finally { client.destroy(); }
});

test('bounded fallback rejects undeclared excess/short data and aborts temporary multipart storage', async t => {
    const prior = process.env.NEXT_PUBLIC_ENABLE_BILLING;
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'false';
    const session = { _id: 'upload', owner: 'owner', mode: 'legacy', state: 'uploading', input: { fileSize: 4 }, prepared: { mimeType: 'audio/wav' }, stagingKey: 'owner/.uploads/upload', expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(), leaseUntil: new Date(0) } as UploadSession;
    const db = { collection: (name: string) => name === 'users'
        ? { findOne: async () => userFixture() }
        : { findOneAndUpdate: async () => session, updateOne: async () => ({ matchedCount: 1 }) } } as unknown as Db;
    let aborted = 0, completed = 0;
    t.mock.method(ingestionStorage, 'create', async () => 'multipart');
    t.mock.method(ingestionStorage, 'abort', async () => { aborted++; });
    t.mock.method(ingestionStorage, 'putPart', async () => ({}));
    t.mock.method(ingestionStorage, 'complete', async () => { completed++; });
    try {
        await assert.rejects(streamBoundedUpload(new Request('https://app.example.com/upload', { method: 'PUT', body: Buffer.alloc(5) }), session, db), /exceeds/);
        await assert.rejects(streamBoundedUpload(new Request('https://app.example.com/upload', { method: 'PUT', body: Buffer.alloc(3) }), session, db), /shorter/);
        assert.equal(aborted, 2); assert.equal(completed, 0);
        await streamBoundedUpload(new Request('https://app.example.com/upload', { method: 'PUT', body: Buffer.alloc(4) }), session, db);
        assert.equal(completed, 1);
    } finally { process.env.NEXT_PUBLIC_ENABLE_BILLING = prior; }
});

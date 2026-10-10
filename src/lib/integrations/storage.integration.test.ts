import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CompleteMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getStorageClient, storageBucket } from '@/lib/r2';
import { ingestionStorage } from './storage';
import { ApiError, PART_BYTES } from './contracts';

test('isolated S3 transport signs parts, validates audio, and protects promoted files', { skip: !process.env.VOSIFT_TEST_STORAGE_ENDPOINT }, async t => {
    const saved = { ...process.env };
    Object.assign(process.env, {
        R2_ENDPOINT: process.env.VOSIFT_TEST_STORAGE_ENDPOINT,
        S3_PUBLIC_ENDPOINT: process.env.VOSIFT_TEST_STORAGE_ENDPOINT,
        R2_BUCKET_NAME: process.env.VOSIFT_TEST_STORAGE_BUCKET || 'api-test',
        R2_ACCESS_KEY_ID: process.env.VOSIFT_TEST_STORAGE_ACCESS_KEY || 'S3RVER',
        R2_SECRET_ACCESS_KEY: process.env.VOSIFT_TEST_STORAGE_SECRET_KEY || 'S3RVER',
        S3_REGION: 'us-east-1', S3_FORCE_PATH_STYLE: 'true',
    });
    const prefix = `isolated-test/${randomUUID()}`; const stage = `${prefix}/staging`; const final = `${prefix}/final`;
    const wav = Buffer.alloc(PART_BYTES + 16044); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
    let uploadId: string | undefined;
    try {
        uploadId = await ingestionStorage.create(stage, 'audio/wav');
        const parts: { partNumber: number; etag: string; size: number }[] = [];
        for (let partNumber = 1; partNumber <= 2; partNumber++) {
            const body = wav.subarray((partNumber - 1) * PART_BYTES, partNumber * PART_BYTES);
            const url = await ingestionStorage.sign(stage, uploadId, partNumber);
            const response = await fetch(url, { method: 'PUT', body });
            assert.equal(response.status, 200); parts.push({ partNumber, etag: response.headers.get('etag')!, size: body.length });
        }
        if (process.env.VOSIFT_TEST_STORAGE_PARTS_UNSUPPORTED === 'true') {
            // S3rver lacks ListParts/Abort. This explicit mode verifies real signed
            // network transfers, completion, HEAD/GET, and COPY only. Production
            // compatibility requires running without this flag against MinIO/S3.
            await getStorageClient().send(new CompleteMultipartUploadCommand({ Bucket: storageBucket(), Key: stage, UploadId: uploadId, MultipartUpload: { Parts: parts.map(part => ({ PartNumber: part.partNumber, ETag: part.etag })) } }));
        } else {
            assert.deepEqual((await ingestionStorage.parts(stage, uploadId)).map(part => part.size), parts.map(part => part.size));
            await ingestionStorage.complete(stage, uploadId, wav.length);
        }
        const head = await ingestionStorage.head(stage);
        assert.equal(head?.ContentLength, wav.length);
        assert.ok(await ingestionStorage.validate(stage, 'audio/wav', wav.length, head?.ETag) > 0);
        await assert.rejects(ingestionStorage.validate(stage, 'audio/mpeg', wav.length), ApiError);
        if (process.env.VOSIFT_TEST_STORAGE_PARTS_UNSUPPORTED !== 'true') await assert.rejects(ingestionStorage.promote(stage, final, '"wrong-etag"'));
        await ingestionStorage.promote(stage, final, head?.ETag);
        await ingestionStorage.remove(stage);
        assert.equal(await ingestionStorage.head(stage), null);
        assert.equal((await ingestionStorage.head(final))?.ContentLength, wav.length);
    } finally {
        await ingestionStorage.remove(stage).catch(() => {}); await ingestionStorage.remove(final).catch(() => {});
        if (uploadId && process.env.VOSIFT_TEST_STORAGE_PARTS_UNSUPPORTED !== 'true') await ingestionStorage.abort(stage, uploadId).catch(() => {});
        t.mock.restoreAll();
        for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]; Object.assign(process.env, saved);
    }
});

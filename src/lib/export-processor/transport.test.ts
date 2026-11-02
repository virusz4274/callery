import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { once } from 'node:events';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getExportStorageClient } from './storage-client';

test('the configured export transport uploads a file stream with a fixed length through native fetch', { timeout: 10_000 }, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'vosift-export-transport-'));
    const bytes = Buffer.alloc(256 * 1024, 0x5a);
    const file = path.join(directory, 'synthetic.zip');
    await writeFile(file, bytes);
    const received: { headers: IncomingHttpHeaders; bytes: Buffer }[] = [];
    const server = createServer(async (request, response) => {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        received.push({ headers: request.headers, bytes: Buffer.concat(chunks) });
        response.writeHead(200, { etag: '"fixture"' }); response.end();
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const exportConfig = getExportStorageClient().config;
    const client = new S3Client({ requestHandler: exportConfig.requestHandler, maxAttempts: exportConfig.maxAttempts,
        requestChecksumCalculation: exportConfig.requestChecksumCalculation,
        endpoint: `http://127.0.0.1:${address.port}`, region: 'us-east-1', forcePathStyle: true,
        credentials: { accessKeyId: 'synthetic', secretAccessKey: 'synthetic' } });
    const body = createReadStream(file);
    try {
        await client.send(new PutObjectCommand({ Bucket: 'synthetic', Key: 'part.zip', Body: body, ContentLength: bytes.length }));
        assert.equal(received.length, 1);
        assert.deepEqual(received[0].bytes, bytes);
        assert.equal(received[0].headers['content-length'], String(bytes.length));
        for (const header of ['transfer-encoding', 'content-encoding', 'x-amz-trailer']) assert.equal(received[0].headers[header], undefined, header);
        assert.equal(await client.config.maxAttempts(), 1);
    } finally {
        body.destroy(); await finished(body).catch(() => {});
        client.destroy(); server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        await rm(directory, { recursive: true, force: true });
    }
});

test('the export fetch transport honors an abort while waiting for upload acknowledgement', { timeout: 10_000 }, async () => {
    const server = createServer(async request => { for await (const _chunk of request) { /* consume without acknowledging */ } });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address === 'object');
    const exportConfig = getExportStorageClient().config;
    const client = new S3Client({ requestHandler: exportConfig.requestHandler, maxAttempts: exportConfig.maxAttempts,
        requestChecksumCalculation: exportConfig.requestChecksumCalculation,
        endpoint: `http://127.0.0.1:${address.port}`, region: 'us-east-1', forcePathStyle: true,
        credentials: { accessKeyId: 'synthetic', secretAccessKey: 'synthetic' } });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 50);
    try {
        await assert.rejects(client.send(new PutObjectCommand({ Bucket: 'synthetic', Key: 'part.zip', Body: Buffer.from('synthetic') }),
            { abortSignal: controller.signal }), { name: 'AbortError' });
    } finally {
        clearTimeout(timer); client.destroy(); server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
});

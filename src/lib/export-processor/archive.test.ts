import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { Readable } from 'node:stream';
import type { ReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { ObjectId } from 'mongodb';
import type { Recording } from '@/lib/db/types';
import { logger } from '@/lib/logger';
import { toExportFailure } from './errors';
import { S3Client } from '@aws-sdk/client-s3';
import { getExportStorageClient } from './storage-client';
import { createServer } from 'node:http';
import { once } from 'node:events';

type State = {
    directories: string[]; uploads: ReadStream[]; uploaded: Buffer[]; abandoned: number; completed: number; deleted: number;
    tokens: (string | undefined)[]; put: (body: ReadStream) => Promise<void>; source: () => Readable; publish: boolean;
    client?: S3Client; failAbandon?: boolean; failRemove?: boolean;
};
const symbol = Symbol.for('vosift.test.export-archive');
const shared = globalThis as typeof globalThis & { [symbol]: State };
const stateRef = "globalThis[Symbol.for('vosift.test.export-archive')]";
const hook = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/export-processor/archive.ts')) {
        const source = specifier === './storage-client' ? `export function getExportStorageClient(){return {async send(command,options){const state=${stateRef};if(state.client){if(command.constructor.name==='PutObjectCommand')state.uploads.push(command.input.Body);return state.client.send(command,options);}const name=command.constructor.name;if(name==='HeadObjectCommand')throw Object.assign(new Error('missing'),{name:'NotFound'});if(name==='GetObjectCommand')return {Body:state.source()};if(name==='PutObjectCommand'){state.uploads.push(command.input.Body);await state.put(command.input.Body);return {};}if(name==='DeleteObjectCommand'){state.deleted++;return {};}throw new Error('Unexpected fixture command');}};}`
            : specifier === '@/lib/r2' ? `export function storageBucket(){return 'synthetic';}`
            : specifier === '@/lib/export-viewer-template' ? `export const VIEWER_HTML='<html>synthetic</html>';`
            : specifier === 'node:fs/promises' ? `import {mkdtemp as realMkdtemp,rm as realRm,stat} from 'node:fs/promises';export {stat};export async function rm(...args){await realRm(...args);if(${stateRef}.failRemove)throw new Error('private cleanup error');}export async function mkdtemp(...args){const result=await realMkdtemp(...args);${stateRef}.directories.push(result);return result;}`
            : specifier === './object-lifecycle' ? `export async function assertExportActive(subject,jobId,db,token){${stateRef}.tokens.push(token);}export async function beginExportObjectWrite(subject,jobId,key,db,token){${stateRef}.tokens.push(token);return {_id:key};}export async function completeExportObjectWrite(intent,db,token){${stateRef}.tokens.push(token);${stateRef}.completed++;return ${stateRef}.publish;}export async function abandonExportObjectWrite(){${stateRef}.abandoned++;if(${stateRef}.failAbandon)throw new Error('private cleanup error');}`
            : undefined;
        if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    return next(specifier, context);
} });
const { ensurePartUploaded } = await import('./archive');
hook.deregister();

function fixture(): State {
    const state: State = { directories: [], uploads: [], uploaded: [], abandoned: 0, completed: 0, deleted: 0, tokens: [], publish: true,
        source: () => Readable.from([Buffer.from('synthetic audio')]),
        put: async body => { const chunks: Buffer[] = []; for await (const chunk of body) chunks.push(Buffer.from(chunk)); state.uploaded.push(Buffer.concat(chunks)); } };
    shared[symbol] = state;
    return state;
}

function recording(): Recording {
    const date = new Date('2026-01-01T00:00:00Z');
    return { _id: new ObjectId(), authSubject: 'synthetic-subject', fileName: 'synthetic.wav', r2Key: 'private-storage-key', fileSize: 15,
        recordedAt: date, createdAt: date, updatedAt: date, duration: 1, phoneNumber: 'synthetic', contactName: 'synthetic' } as Recording;
}

async function assertCleaned(state: State) {
    assert.equal(state.directories.length, 1);
    for (const directory of state.directories) await assert.rejects(stat(directory), { code: 'ENOENT' });
    for (const stream of state.uploads) { assert.equal(stream.destroyed, true); assert.equal(stream.closed, true); }
}

test('archive retry opens a fresh upload stream and closes failed attempts before retrying', async t => {
    const state = fixture();
    const logs: unknown[][] = [];
    t.mock.method(logger, 'warn', (...args: unknown[]) => { logs.push(args); });
    const successfulPut = state.put;
    state.put = async body => {
        if (state.uploads.length === 1) throw new TypeError('fetch failed', { cause: Object.assign(new Error('private endpoint'), { code: 'UND_ERR_INVALID_ARG' }) });
        assert.equal(state.uploads[0].closed, true);
        await successfulPut(body);
    };
    const part = await ensurePartUploaded('synthetic-subject', new ObjectId().toString(), 1, [recording()], 1024 * 1024, 'synthetic-worker');
    assert.equal(state.uploads.length, 2);
    assert.notEqual(state.uploads[0], state.uploads[1]);
    assert.equal(part.size, state.uploaded[0].length);
    assert.equal(state.completed, 1); assert.equal(state.abandoned, 0);
    assert.ok(state.tokens.every(token => token === 'synthetic-worker'));
    assert.equal(JSON.stringify(logs).includes('private-storage-key'), false);
    assert.equal(JSON.stringify(logs).includes('private endpoint'), false);
    await assertCleaned(state);
});

test('permanent upload failure preserves the transport cause and abandons its intent after two attempts', async t => {
    const state = fixture(); t.mock.method(logger, 'warn', () => {});
    const cause = Object.assign(new Error('private network details'), { code: 'ECONNRESET' });
    state.put = async () => { throw new TypeError('fetch failed', { cause }); };
    await assert.rejects(ensurePartUploaded('synthetic-subject', new ObjectId().toString(), 1, [recording()]), error => {
        assert.deepEqual(toExportFailure(error), { stage: 'archive-upload', code: 'transport', retryable: true, transportCode: 'ECONNRESET' }); return true;
    });
    assert.equal(state.uploads.length, 2); assert.equal(state.abandoned, 1); assert.equal(state.completed, 0);
    await assertCleaned(state);
});

test('cleanup failures cannot replace the original upload failure or leak their provider messages', async t => {
    const state = fixture(); state.failAbandon = true; state.failRemove = true;
    const logs: unknown[][] = []; t.mock.method(logger, 'warn', (...args: unknown[]) => { logs.push(args); });
    state.put = async () => { throw Object.assign(new Error('private upload error'), { code: 'ECONNRESET' }); };
    await assert.rejects(ensurePartUploaded('synthetic-subject', new ObjectId().toString(), 1, [recording()]), error => {
        assert.deepEqual(toExportFailure(error), { stage: 'archive-upload', code: 'transport', retryable: true, transportCode: 'ECONNRESET' }); return true;
    });
    assert.equal(JSON.stringify(logs).includes('private'), false); await assertCleaned(state);
});

test('an aborted upload closes both bounded attempts and removes its temporary archive', async t => {
    const state = fixture(); t.mock.method(logger, 'warn', () => {});
    state.put = async () => { throw new DOMException('private abort reason', 'AbortError'); };
    await assert.rejects(ensurePartUploaded('synthetic-subject', new ObjectId().toString(), 1, [recording()]), error => {
        assert.equal(toExportFailure(error).stage, 'archive-upload'); assert.equal(toExportFailure(error).retryable, true); return true;
    });
    assert.equal(state.uploads.length, 2); assert.equal(state.abandoned, 1);
    await assertCleaned(state);
});

test('a source body failure after GET retains its stage and transport code', async () => {
    const state = fixture();
    const source = Readable.from((async function* () { yield Buffer.from('part'); throw Object.assign(new Error('private source details'), { code: 'ECONNRESET' }); })());
    state.source = () => source;
    await assert.rejects(ensurePartUploaded('synthetic-subject', new ObjectId().toString(), 1, [recording()]), error => {
        assert.deepEqual(toExportFailure(error), { stage: 'source-download', code: 'transport', retryable: true, transportCode: 'ECONNRESET' }); return true;
    });
    assert.equal(state.uploads.length, 0); assert.equal(source.destroyed, true);
    await assertCleaned(state);
});

test('an oversized source cannot become a retryable transport failure', async () => {
    const state = fixture(); state.source = () => Readable.from([Buffer.alloc(32)]);
    await assert.rejects(ensurePartUploaded('synthetic-subject', new ObjectId().toString(), 1, [recording()]), error => {
        assert.equal(toExportFailure(error).stage, 'source-download'); assert.equal(toExportFailure(error).code, 'source-size');
        assert.equal(toExportFailure(error).retryable, false); return true;
    });
    assert.equal(state.uploads.length, 0); await assertCleaned(state);
});

test('revocation during upload prevents publication and deletes the unacknowledged part', async () => {
    const state = fixture(); state.publish = false;
    await assert.rejects(ensurePartUploaded('synthetic-subject', new ObjectId().toString(), 1, [recording()]), error => {
        assert.equal(toExportFailure(error).code, 'cancelled'); assert.equal(toExportFailure(error).retryable, false); return true;
    });
    assert.equal(state.deleted, 1); assert.equal(state.abandoned, 1); await assertCleaned(state);
});

test('a complete archive reads fixture audio and streams its ZIP through the actual SDK and native fetch', { timeout: 10_000 }, async () => {
    const state = fixture();
    const audio = Buffer.from('synthetic audio');
    const uploads: Buffer[] = [];
    const methods: string[] = [];
    const server = createServer(async (request, response) => {
        methods.push(request.method!);
        if (request.method === 'HEAD') { response.writeHead(404); response.end(); return; }
        if (request.method === 'GET') { response.writeHead(200, { 'content-length': audio.length }); response.end(audio); return; }
        const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
        uploads.push(Buffer.concat(chunks));
        assert.equal(request.headers['content-length'], String(uploads.at(-1)!.length));
        assert.equal(request.headers['transfer-encoding'], undefined);
        response.writeHead(200, { etag: '"synthetic"' }); response.end();
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address === 'object');
    const config = getExportStorageClient().config;
    state.client = new S3Client({ requestHandler: config.requestHandler, maxAttempts: config.maxAttempts, requestChecksumCalculation: config.requestChecksumCalculation,
        endpoint: `http://127.0.0.1:${address.port}`, region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: 'synthetic', secretAccessKey: 'synthetic' } });
    try {
        const part = await ensurePartUploaded('synthetic-subject', new ObjectId().toString(), 1, [recording()], 1024 * 1024, 'synthetic-worker');
        assert.deepEqual(methods, ['HEAD', 'GET', 'PUT']); assert.equal(uploads.length, 1);
        assert.equal(uploads[0].readUInt32LE(0), 0x04034b50); assert.equal(part.size, uploads[0].length);
        assert.equal(state.completed, 1); await assertCleaned(state);
    } finally {
        state.client.destroy(); server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
});

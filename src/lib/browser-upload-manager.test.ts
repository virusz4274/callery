import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserUploadManager, UploadTransferSlots } from './browser-upload-manager';
import { decodeUploadQueue, originalFileMatches, type BrowserUploadItem, type BrowserUploadSession } from './browser-uploads-contract';
import { BrowserUploadError, finalizeBrowserUpload, type BrowserUploadApi } from './r2-direct-upload-client';
import type { UploadQueuePersistence } from './browser-upload-persistence';

const sleep = (ms = 5) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean) { for (let i = 0; i < 1000; i++) { if (predicate()) return; await sleep(); } throw new Error('Upload did not reach its expected state.'); }
const sample = (name = 'call.wav', size = 24, value = 1) => new File([new Uint8Array(size).fill(value)], name, { type: 'audio/wav', lastModified: 12345 });
function memory() {
    const saved = new Map<string, BrowserUploadItem[]>();
    const persistence: UploadQueuePersistence = { load: async owner => structuredClone(saved.get(owner) || []), save: async (owner, items) => { saved.set(owner, structuredClone(items)); } };
    return { persistence, saved };
}
function fixture() {
    const sessions = new Map<string, BrowserUploadSession>();
    const keys = new Map<string, string>();
    const uploaded = new Map<string, Map<number, Blob>>();
    let transfers = 0, maximum = 0, createCount = 0, completeCount = 0, cancelCount = 0;
    const partCalls: string[] = [];
    let loseCompleteResponse = false;
    const api: BrowserUploadApi = {
        async create(item) {
            const existing = keys.get(item.requestKey);
            if (existing) return structuredClone(sessions.get(existing)!);
            createCount++;
            const id = item.id;
            const value: BrowserUploadSession = { id, state: 'uploading', fileSize: item.fileSize, partSize: 4, partCount: Math.ceil(item.fileSize / 4), expiresAt: new Date(Date.now() + 86400_000).toISOString(), recordingId: null, transport: 'proxy' };
            keys.set(item.requestKey, id); sessions.set(id, value); uploaded.set(id, new Map()); return structuredClone(value);
        },
        async status(id) {
            const value = sessions.get(id)!;
            return { ...structuredClone(value), parts: Array.from(uploaded.get(id) || []).map(([partNumber, bytes]) => ({ partNumber, size: bytes.size, etag: 'fixture' })) };
        },
        async part(id, part, bytes, _direct, signal, progress) {
            signal.throwIfAborted(); transfers++; maximum = Math.max(maximum, transfers); partCalls.push(`${id}:${part}`);
            try {
                progress(1);
                await new Promise<void>((resolve, reject) => {
                    const abort = () => { clearTimeout(timer); reject(new DOMException('Upload paused', 'AbortError')); };
                    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 15);
                    signal.addEventListener('abort', abort, { once: true });
                });
                signal.throwIfAborted(); uploaded.get(id)!.set(part, bytes); progress(bytes.size);
            } finally { transfers--; }
        },
        async complete(id) {
            completeCount++;
            const session = sessions.get(id)!;
            assert.equal(uploaded.get(id)!.size, session.partCount);
            session.state = 'completed'; session.recordingId = `recording-${id}`;
            if (loseCompleteResponse) { loseCompleteResponse = false; throw new BrowserUploadError('Completion response lost.'); }
            return structuredClone(session);
        },
        async cancel(id) { cancelCount++; const session = sessions.get(id)!; session.state = 'cancelled'; return structuredClone(session); },
    };
    return { api, sessions, uploaded, partCalls, get maximum() { return maximum; }, get createCount() { return createCount; }, get completeCount() { return completeCount; }, get cancelCount() { return cancelCount; }, loseCompletion() { loseCompleteResponse = true; } };
}

test('file and global part concurrency remain bounded while reporting transferred bytes', async () => {
    const server = fixture(), storage = memory(), manager = new BrowserUploadManager(server.api, storage.persistence);
    await manager.setOwner('owner');
    manager.add(Array.from({ length: 5 }, (_, index) => sample(`call-${index}.wav`)));
    const partial: number[] = [];
    manager.subscribe(() => { const item = manager.getSnapshot().items.find(value => value.status === 'uploading' && value.progressBytes > value.completedBytes); if (item) partial.push(item.progressBytes); });
    manager.start(manager.getSnapshot().items.map(item => item.id));
    await until(() => manager.getSnapshot().items.every(item => item.status === 'success'));
    assert.equal(server.maximum, 4);
    assert.ok(partial.length > 0);
    assert.equal(server.createCount, 5); assert.equal(server.completeCount, 5);
    assert.ok(manager.getSnapshot().items.every(item => item.progressBytes === item.fileSize));
});

test('paused/reloaded uploads reselect the original file and transfer only unfinished parts', async () => {
    const server = fixture(), storage = memory(), manager = new BrowserUploadManager(server.api, storage.persistence), file = sample('resume.wav', 80);
    await manager.setOwner('owner'); manager.add([file]);
    const id = manager.getSnapshot().items[0].id; manager.start([id]);
    await until(() => manager.getSnapshot().items[0].completedBytes >= 8);
    manager.pause(id); await sleep(30);
    const finished = new Set(Array.from(server.uploaded.get(id)!.keys()));
    assert.ok(finished.size > 0 && finished.size < 20);
    const calls = server.partCalls.length;
    const recovered = new BrowserUploadManager(server.api, storage.persistence);
    await recovered.setOwner('owner'); await sleep();
    assert.equal(recovered.getSnapshot().items[0].status, 'needs-file');
    recovered.reselect(id, sample('different.wav', 80));
    assert.match(recovered.getSnapshot().items[0].error!, /original file/);
    recovered.reselect(id, file);
    await until(() => recovered.getSnapshot().items[0].status === 'success');
    const resumed = server.partCalls.slice(calls).map(call => Number(call.split(':').at(-1)));
    assert.ok(resumed.every(part => !finished.has(part)));
    assert.equal(server.createCount, 1);
    assert.equal('file' in storage.saved.get('owner')![0], false);
    assert.equal(JSON.stringify(storage.saved.get('owner')).includes('https://'), false);
});

test('reselected content must match every saved completed part', async () => {
    const server = fixture(), storage = memory(), manager = new BrowserUploadManager(server.api, storage.persistence), file = sample('verify.wav', 80);
    await manager.setOwner('owner'); manager.add([file]);
    const id = manager.getSnapshot().items[0].id; manager.start([id]);
    await until(() => manager.getSnapshot().items[0].completedBytes >= 4);
    manager.pause(id); await sleep(30);
    const recovered = new BrowserUploadManager(server.api, storage.persistence); await recovered.setOwner('owner');
    recovered.reselect(id, sample('verify.wav', 80, 2));
    await until(() => recovered.getSnapshot().items[0].status === 'needs-file' && !!recovered.getSnapshot().items[0].error);
    assert.match(recovered.getSnapshot().items[0].error!, /does not match/);
});

test('a lost completion response recovers the same recording without uploading again', async () => {
    const server = fixture(), storage = memory(), manager = new BrowserUploadManager(server.api, storage.persistence);
    server.loseCompletion(); await manager.setOwner('owner'); manager.add([sample()]);
    const id = manager.getSnapshot().items[0].id; manager.start([id]);
    await until(() => manager.getSnapshot().items[0].status === 'success');
    const transfers = server.partCalls.length;
    manager.start([id]);
    assert.equal(server.partCalls.length, transfers); assert.equal(server.createCount, 1); assert.equal(server.completeCount, 1);
});

test('offline resume, cancellation and account changes preserve isolation and cleanup', async () => {
    const server = fixture(), storage = memory(), manager = new BrowserUploadManager(server.api, storage.persistence);
    await manager.setOwner('first'); manager.add([sample('offline.wav', 120)]);
    const id = manager.getSnapshot().items[0].id; manager.start([id]);
    await until(() => !!manager.getSnapshot().items[0].sessionId);
    manager.setOnline(false); await sleep(25); assert.equal(manager.getSnapshot().items[0].status, 'offline');
    manager.setOnline(true); await until(() => manager.getSnapshot().items[0].status === 'uploading');
    assert.equal(await manager.cancel(id), true); assert.equal(server.cancelCount, 1);
    assert.equal(manager.getSnapshot().items[0].status, 'cancelled');
    await manager.setOwner('second'); assert.equal(manager.getSnapshot().items.length, 0);
    assert.ok(storage.saved.has('first'));
});

test('storage failure keeps foreground uploads working with recovery unavailable', async () => {
    const server = fixture();
    const manager = new BrowserUploadManager(server.api, { load: async () => { throw new Error('disabled'); }, save: async () => { throw new Error('disabled'); } });
    await manager.setOwner('owner'); manager.add([sample()]); manager.start(manager.getSnapshot().items.map(item => item.id));
    await until(() => manager.getSnapshot().items[0].status === 'success');
    assert.equal(manager.getSnapshot().recoveryAvailable, false);
});

test('queued semaphore waiters abort without consuming a transfer slot', async () => {
    const slots = new UploadTransferSlots(1), held = new AbortController(), cancelled = new AbortController();
    let release!: () => void;
    const first = slots.run(held.signal, () => new Promise<void>(resolve => { release = resolve; }));
    const second = slots.run(cancelled.signal, async () => assert.fail('Cancelled part must not run'));
    cancelled.abort(); await assert.rejects(second); release(); await first;
    assert.equal(await slots.run(held.signal, async () => 42), 42);
});

test('original-file identity includes modification time as well as name and size', () => {
    const file = sample();
    assert.equal(originalFileMatches({ fileName: file.name, fileSize: file.size, lastModified: file.lastModified } as BrowserUploadItem, file), true);
    assert.equal(originalFileMatches({ fileName: file.name, fileSize: file.size, lastModified: 1 } as BrowserUploadItem, file), false);
});


test('finalization polls an active lease without retransferring or requiring a file', async () => {
    let reads = 0, submissions = 0;
    const session: BrowserUploadSession = { id: 'saved', state: 'finalizing', fileSize: 12, partSize: 4, partCount: 3, expiresAt: new Date(Date.now() + 10000).toISOString(), recordingId: null, transport: 'proxy' };
    const api = {
        complete: async () => { submissions++; throw new BrowserUploadError('A worker is finishing this upload.', 409, 'upload_busy'); },
        status: async () => ({ ...session, ...(++reads === 3 ? { state: 'completed' as const, recordingId: 'saved-recording' } : {}) }),
    } as unknown as BrowserUploadApi;
    const result = await finalizeBrowserUpload(api, session.id, new AbortController().signal, { intervalMs: 1, maximumPolls: 4 });
    assert.equal(result.recordingId, 'saved-recording'); assert.equal(submissions, 1); assert.equal(reads, 3);
    await assert.rejects(finalizeBrowserUpload({ ...api, status: async () => session } as BrowserUploadApi, session.id, new AbortController().signal, { intervalMs: 1, maximumPolls: 1 }), /still finishing/);
});

test('corrupt browser metadata is ignored and unknown fields never enter the restored queue', () => {
    const valid: BrowserUploadItem = { id: 'item', fileName: 'call.wav', fileSize: 12, lastModified: 1, mimeType: 'audio/wav', fingerprint: 'call.wav-12-1', requestKey: 'stable-key', status: 'paused', completedBytes: 4, progressBytes: 5, checksums: { 1: 'a'.repeat(64) } };
    const values = decodeUploadQueue([null, {}, { ...valid, fileSize: -1 }, { ...valid, checksums: [] }, { ...valid, status: 'unknown' }, { ...valid, signedUrl: 'secret-url', file: new Blob(['never restore file bytes']) }]);
    assert.equal(values.length, 1); assert.equal(values[0].progressBytes, 4); assert.equal('signedUrl' in values[0], false); assert.equal('file' in values[0], false);
    assert.deepEqual(decodeUploadQueue('invalid'), []);
});

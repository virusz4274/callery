import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedAudioHandler, parseAudioRange, type SharedAudioDependencies } from './shared-audio';

const context = { params: Promise.resolve({ token: 'grant-token' }) };
const bytes = new TextEncoder().encode('0123456789');
function fixture() {
    let allowed = true, reads = 0, heads = 0;
    let signal: AbortSignal | undefined;
    const ranges: (string | undefined)[] = [];
    const deps: SharedAudioDependencies = {
        resolve: async () => allowed ? { key: 'PRIVATE_KEY', mimeType: 'audio/wav' } : null,
        head: async () => { heads++; return { size: bytes.length, mimeType: 'audio/wav', etag: 'fixture-etag' }; },
        read: async (_source, _metadata, range, requestSignal) => {
            reads++; ranges.push(range); signal = requestSignal;
            const parsed = range ? parseAudioRange(range, bytes.length)! : { start: 0, end: bytes.length - 1 };
            return new ReadableStream({ start(output) { output.enqueue(bytes.slice(parsed.start, parsed.end + 1)); output.close(); } });
        },
    };
    return { handler: createSharedAudioHandler(deps), deps, ranges, deny: () => { allowed = false; },
        reads: () => reads, heads: () => heads, signal: () => signal };
}
function request(headers: HeadersInit = {}, method = 'GET') {
    return new Request('https://app.example.test/api/shares/grant-token/audio', { method, headers });
}

test('full audio and HEAD are private, length-correct and do not expose a storage URL', async () => {
    const f = fixture();
    const response = await f.handler(request(), context);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '0123456789');
    assert.equal(response.headers.get('content-length'), '10');
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('content-type'), 'audio/wav');
    assert.equal(response.headers.get('location'), null);
    assert.equal(JSON.stringify([...response.headers]).includes('PRIVATE_KEY'), false);
    const head = await f.handler(request({ range: 'bytes=2-3' }, 'HEAD'), context);
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal(head.headers.get('content-length'), '10');
    assert.equal(f.reads(), 1);
});

test('bounded, open and suffix ranges return only the requested bytes', async () => {
    const f = fixture();
    for (const [range, expected, contentRange] of [
        ['bytes=2-5', '2345', 'bytes 2-5/10'], ['bytes=7-', '789', 'bytes 7-9/10'],
        ['bytes=-3', '789', 'bytes 7-9/10'], ['bytes=8-999', '89', 'bytes 8-9/10'],
    ]) {
        const response = await f.handler(request({ Range: range }), context);
        assert.equal(response.status, 206);
        assert.equal(await response.text(), expected);
        assert.equal(response.headers.get('content-range'), contentRange);
        assert.equal(response.headers.get('content-length'), String(expected.length));
    }
    assert.deepEqual(f.ranges, ['bytes=2-5', 'bytes=7-9', 'bytes=7-9', 'bytes=8-9']);
});

test('invalid or multiple ranges are rejected before reading the object', async () => {
    const f = fixture();
    for (const range of ['bytes=10-', 'bytes=5-2', 'bytes=-0', 'bytes=0-1,4-5', 'items=0-1', 'bytes=-', 'bytes=99999999999999999999-']) {
        const response = await f.handler(request({ range }), context);
        assert.equal(response.status, 416, range);
        assert.equal(response.headers.get('content-range'), 'bytes */10');
        assert.equal(await response.text(), '');
    }
    assert.equal(f.reads(), 0);
});

test('revocation denies subsequent range and HEAD requests before touching storage', async () => {
    const f = fixture();
    await (await f.handler(request({ range: 'bytes=0-2' }), context)).text();
    f.deny();
    assert.equal((await f.handler(request({ range: 'bytes=3-5' }), context)).status, 404);
    assert.equal((await f.handler(request({}, 'HEAD'), context)).status, 404);
    assert.equal(f.heads(), 1);
    assert.equal(f.reads(), 1);
});

test('response cancellation and request abort propagate to storage', async () => {
    const f = fixture();
    let cancelled = false;
    f.deps.read = async (_source, _metadata, _range, signal) => {
        signal.addEventListener('abort', () => { cancelled = true; });
        return new ReadableStream({ pull() {}, cancel() { cancelled = true; } });
    };
    const handler = createSharedAudioHandler(f.deps);
    const response = await handler(request(), context);
    await response.body!.cancel();
    assert.equal(cancelled, true);
    const controller = new AbortController();
    cancelled = false;
    const response2 = await handler(new Request('https://app.example.test/audio', { signal: controller.signal }), context);
    controller.abort();
    assert.equal(cancelled, true);
    await response2.body!.cancel();
});

test('missing audio and storage errors return noncached generic failures', async () => {
    const f = fixture();
    for (const [error, status] of [[{ name: 'NoSuchKey' }, 404], [new Error('PRIVATE_ENDPOINT'), 503]] as const) {
        f.deps.head = async () => { throw error; };
        const response = await createSharedAudioHandler(f.deps)(request(), context);
        assert.equal(response.status, status);
        assert.equal(await response.text(), '');
        assert.equal(response.headers.get('cache-control'), 'private, no-store');
    }
});

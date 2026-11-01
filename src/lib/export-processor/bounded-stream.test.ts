import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { boundedExportStream } from './bounded-stream';
import { getExportStorageClient } from './storage-client';

test('archive source streaming rejects excess bytes even without a Content-Length header', async () => {
    const source = Readable.from([Buffer.from('123'), Buffer.from('456')]);
    await assert.rejects(async () => { for await (const _chunk of boundedExportStream(source, 5)) { /* drain */ } }, /exceeded its verified size/);
    assert.equal(source.destroyed, true);
});
test('archive source streaming preserves an exactly bounded source', async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of boundedExportStream(Readable.from([Buffer.from('123'), Buffer.from('45')]), 5)) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString(), '12345');
    assert.throws(() => boundedExportStream(Readable.from([]), 0), /verified source size/);
});
test('archive requests do not multiply counted retries inside the S3 SDK', async () => {
    assert.equal(await getExportStorageClient().config.maxAttempts(), 1);
});

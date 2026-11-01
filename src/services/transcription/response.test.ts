import test from 'node:test';
import assert from 'node:assert/strict';
import { readBoundedTranscriptionText, TranscriptionResponseTooLargeError } from './response';

test('transcript response reading bounds declared and streamed bytes before JSON parsing', async () => {
    await assert.rejects(readBoundedTranscriptionText(new Response('ok', { headers: { 'content-length': '99999' } }), 100), TranscriptionResponseTooLargeError);
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('123')); controller.enqueue(new TextEncoder().encode('456')); controller.close(); } });
    await assert.rejects(readBoundedTranscriptionText(new Response(stream), 5), TranscriptionResponseTooLargeError);
    assert.equal(await readBoundedTranscriptionText(new Response('{"ok":true}'), 11), '{"ok":true}');
});

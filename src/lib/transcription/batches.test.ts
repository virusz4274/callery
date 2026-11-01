import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranscriptionBatch, updateTranscriptionBatch } from './batches';

test('batch selections reject empty, duplicate, invalid and oversized recording selections before touching the database', async () => {
    const id = '1234567890abcdef12345678';
    for (const recordingIds of [[], [id, id], ['invalid'], Array.from({ length: 1001 }, (_, index) => index.toString(16).padStart(24, '0'))]) {
        await assert.rejects(createTranscriptionBatch('owner', { recordingIds }), error => error instanceof Error && 'status' in error && error.status === 400);
    }
});

test('batch mutations reject invalid identifiers, unsupported actions, and untrusted input fields', async () => {
    await assert.rejects(updateTranscriptionBatch('owner', 'bad-id', { action: 'start' }), /Invalid batch ID/);
    await assert.rejects(updateTranscriptionBatch('owner', '1234567890abcdef12345678', { action: 'schedule' }));
    await assert.rejects(createTranscriptionBatch('owner', { recordingIds: ['1234567890abcdef12345678'], owner: 'someone-else' }));
});

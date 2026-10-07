import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecordingsQuery } from './query-utils';

test('needs transcription is applied to both list and count queries with the same owner and filters', () => {
    const filters = { needsTranscription: true, contactId: '507f1f77bcf86cd799439011', startDate: '2026-10-01', search: 'payment' };
    const query = buildRecordingsQuery('owner', { ...filters, limit: 10, skip: 10 });
    assert.deepEqual(query, buildRecordingsQuery('owner', filters));
    assert.equal(query.authSubject, 'owner');
    assert.deepEqual(query.transcriptionStatus, { $ne: 'completed' });
    assert.deepEqual(query.isArchived, { $ne: true });
    assert.equal(String(query.contactId), filters.contactId);
    assert.ok(query.recordedAt);
    assert.ok(query.$or);
    assert.equal(buildRecordingsQuery('owner', {}).transcriptionStatus, undefined);
});

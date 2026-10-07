import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { createGetRecordingsHandler } from './handler';
import { toRecordingResponse } from '@/lib/db/converters';
import { buildRecordingWriteData } from '@/lib/db/recordings/write';
import type { RecordingQueryOptions } from '@/lib/db/recordings';
import type { AtlasSearchOptions } from '@/lib/db/search';

const document = {
    _id: new ObjectId(),
    ...buildRecordingWriteData({
        authSubject: 'owner', contactId: null, contactName: null, phoneNumber: '+1 555 0123',
        r2Key: 'owner/audio.wav', fileName: 'audio.wav', standardizedDisplayName: 'Audio',
        fileSize: 100, mimeType: 'audio/wav', duration: 60,
        recordedAt: new Date('2026-10-05T00:00:00Z'), transcriptionStatus: 'pending',
        tags: [], isStarred: false, isArchived: false,
    }, new Date('2026-10-05T00:00:00Z')),
};

test('transcription collection filters reach paginated reads and counts, including Atlas search', async () => {
    const queries: unknown[] = [];
    const dependencies = {
        getUserFromRequest: async () => 'owner',
        getRecordingsForApi: async (_owner: string, options?: RecordingQueryOptions) => { queries.push(options); return []; },
        countRecordingsByUser: async (_owner: string, options?: RecordingQueryOptions) => { queries.push(options); return 12; },
        searchRecordingsByAtlas: async (_query: string, _owner: string, options?: AtlasSearchOptions) => { queries.push(options); return { results: [], totalCount: 0 }; },
    };
    const response = await createGetRecordingsHandler(dependencies)(new NextRequest('https://app.example.com/api/recordings?needsTranscription=true&page=2&limit=5&search=call&contactId=507f1f77bcf86cd799439011'));
    const body = await response.json();
    assert.equal(body.totalCount, 12);
    assert.equal(body.page, 2);
    assert.equal(body.totalPages, 3);
    assert.equal(queries.length, 3);
    for (const query of queries) {
        assert.equal((query as RecordingQueryOptions).needsTranscription, true);
        assert.equal((query as RecordingQueryOptions).contactId, '507f1f77bcf86cd799439011');
    }
    assert.equal((queries[1] as RecordingQueryOptions).skip, 5);
});

test('recordings API uses page/search, ignores removed aliases, and returns serialized records', async () => {
    const options: RecordingQueryOptions[] = [];
    const GET = createGetRecordingsHandler({
        getUserFromRequest: async () => 'owner',
        getRecordingsForApi: async (owner, query) => {
            assert.equal(owner, 'owner');
            options.push(query!);
            return [toRecordingResponse(document)];
        },
        countRecordingsByUser: async owner => { assert.equal(owner, 'owner'); return 5; },
        searchRecordingsByAtlas: async () => { throw new Error('Atlas should be bypassed for a phone query'); },
    });

    const response = await GET(new NextRequest('https://app.example.com/api/recordings?page=2&limit=2&search=%2B1555&skip=0&q=obsolete'));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.page, 2);
    assert.equal(body.totalPages, 3);
    assert.equal(body.searchMode, 'regex');
    assert.equal(body.recordings[0].id, document._id.toString());
    assert.equal(body.recordings[0].recordedAt, document.recordedAt.toISOString());
    assert.equal(options[0].skip, 2);
    assert.equal(options[0].search, '+1555');

    await GET(new NextRequest('https://app.example.com/api/recordings?skip=500&q=obsolete'));
    assert.equal(options[1].skip, 0);
    assert.equal(options[1].search, undefined);
});

test('recordings API converts Atlas documents once and rejects unauthenticated access', async () => {
    const dependencies = {
        getUserFromRequest: async (): Promise<string | null> => 'owner',
        getRecordingsForApi: async () => { throw new Error('Unexpected database fallback'); },
        countRecordingsByUser: async () => { throw new Error('Unexpected count'); },
        searchRecordingsByAtlas: async () => ({ results: [{ ...document, searchScore: 1 }], totalCount: 1 }),
    };
    const request = new NextRequest('https://app.example.com/api/recordings?search=Audio');
    const body = await (await createGetRecordingsHandler(dependencies)(request)).json();
    assert.equal(body.searchMode, 'atlas');
    assert.equal(body.recordings[0].id, document._id.toString());
    const response = await createGetRecordingsHandler({ ...dependencies, getUserFromRequest: async () => null })(request);
    assert.equal(response.status, 401);
});

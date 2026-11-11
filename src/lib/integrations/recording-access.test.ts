import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { ObjectId } from 'mongodb';
import type { Recording } from '@/lib/db/types';
import type { ApiActor } from './tokens';
import { ApiError } from './contracts';

const state = { owner: '', input: undefined as unknown, results: [] as Recording[] };
(globalThis as Record<symbol, unknown>)[Symbol.for('callery.test.integration-search')] = state;
registerHooks({ resolve(specifier, context, next) {
    if (specifier === '@/lib/search/retrieval' && context.parentURL?.endsWith('/integrations/recording-access.ts')) return {
        url: 'data:text/javascript,' + encodeURIComponent(`export async function retrieveRecordings(owner,input){const s=globalThis[Symbol.for('callery.test.integration-search')];s.owner=owner;s.input=input;return {results:s.results,matches:Object.fromEntries(s.results.map(r=>[r._id.toString(),[{text:'delivery moved',segmentIndex:2,start:12,transcriptRevision:'revision'}]])),coverage:{ready:1,pending:0,failed:0,total:1},totalCount:1,hasMore:false,mode:'vector',resultLimit:200};}`), shortCircuit: true,
    };
    return next(specifier, context);
} });
const { RecordingSearchSchema, TranscriptPageSchema, searchAccessibleRecordings, transcriptPage, MAX_TRANSCRIPT_CHARACTERS } = await import('./recording-access');
const date = new Date('2026-11-11T12:00:00Z');
const row = (text = 'hello') => ({ _id: new ObjectId(), authSubject: 'owner', r2Key: 'secret/key', summaryEmbedding: [1, 2], fileName: 'call.wav',
    recordedAt: date, createdAt: date, updatedAt: date, summary: 'summary', transcriptionStatus: 'completed',
    fullTranscript: [{ text, speakerId: 'speaker-1', start: 12, end: 60, words: [], privateField: 'never exposed' }],
    aiWorkPlan: { private: 'secret plan' }, searchIndexWork: { token: 'secret work' },
} as unknown as Recording);
const actor = { token: { owner: 'owner', scopes: ['recordings:read', 'company:recordings:read'] } } as ApiActor;

test('semantic search validates bounds and filters without accepting an owner override', () => {
    assert.ok(RecordingSearchSchema.safeParse({ query: 'delivery', startDate: '2026-11-01', endDate: '2026-11-11' }).success);
    for (const input of [{ query: '' }, { query: 'x'.repeat(2001) }, { query: 'x', pageSize: 51 }, { query: 'x', owner: 'other' },
        { query: 'x', startDate: '2026-11-12', endDate: '2026-11-11' }]) assert.equal(RecordingSearchSchema.safeParse(input).success, false);
    assert.equal(TranscriptPageSchema.safeParse({ limit: 101 }).success, false);
});

test('search uses the token owner, whitelists records, and returns authenticated evidence links', async () => {
    state.results = [row()];
    const result = await searchAccessibleRecordings(actor, { query: 'delivery', contactId: new ObjectId().toString() });
    assert.equal(state.owner, 'owner');
    assert.equal(result.mode, 'vector');
    const record = result.recordings[0];
    const link = new URL(record.matches[0].url);
    assert.equal(link.pathname, '/recordings'); assert.equal(link.searchParams.get('id'), state.results[0]._id.toString());
    assert.equal(link.searchParams.get('segment'), '2'); assert.equal(link.searchParams.get('t'), '12');
    assert.equal(link.searchParams.get('revision'), 'revision');
    const serialized = JSON.stringify(result);
    for (const field of ['secret/key', 'summaryEmbedding', 'aiWorkPlan', 'searchIndexWork', 'fullTranscript', 'authSubject']) assert.ok(!serialized.includes(field), field);
    await assert.rejects(searchAccessibleRecordings({ token: { owner: 'owner', scopes: ['company:recordings:read'] } } as ApiActor, { query: 'x' }), (error: unknown) => error instanceof ApiError && error.status === 403);
});

test('transcript cursor pages preserve complete large segments and reject stale revisions', () => {
    const recording = row('x'.repeat(MAX_TRANSCRIPT_CHARACTERS - 1) + '😀' + 'y'.repeat(MAX_TRANSCRIPT_CHARACTERS));
    let cursor: string | null = null; let combined = ''; let count = 0;
    do {
        const page = transcriptPage(recording, cursor ? { cursor, limit: 1 } : { limit: 1 });
        assert.ok(page.segments.reduce((sum, segment) => sum + segment.text.length, 0) <= MAX_TRANSCRIPT_CHARACTERS);
        assert.ok(!JSON.stringify(page).includes('never exposed'));
        combined += page.segments.map(segment => segment.text).join(''); cursor = page.nextCursor; count++;
    } while (cursor);
    assert.ok(count >= 3); assert.equal(combined, recording.fullTranscript![0].text);
    const first = transcriptPage(recording, {});
    assert.throws(() => transcriptPage({ ...recording, fullTranscript: [{ text: 'changed', speakerId: 's', words: [] }] }, { cursor: first.nextCursor }),
        (error: unknown) => error instanceof ApiError && error.code === 'transcript_changed');
    assert.throws(() => transcriptPage(recording, { cursor: 'invalid' }), (error: unknown) => error instanceof ApiError && error.code === 'invalid_cursor');
    assert.throws(() => transcriptPage(recording, { revision: 'old-revision' }), (error: unknown) => error instanceof ApiError && error.code === 'transcript_changed');
});

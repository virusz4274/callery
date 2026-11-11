import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { ObjectId, type Db } from 'mongodb';
import type { Recording } from '@/lib/db/types';
import type { RecordingPassage } from './passages';

const key = Symbol.for('vosift.test.semantic-retrieval');
type State = { recordings: Recording[]; passages: RecordingPassage[]; db: Db; ready: boolean; embeddingAvailable: boolean;
    vectorFails: boolean; embeddingCalls: number; pipeline?: Record<string, unknown>[] };
const world = globalThis as typeof globalThis & { [key]: State };
type Row = Record<string, unknown>;
function values(row: unknown, path: string[]): unknown[] {
    if (!path.length) return Array.isArray(row) ? row : [row];
    if (Array.isArray(row) && !/^\d+$/.test(path[0])) return row.flatMap(part => values(part, path));
    return row && typeof row === 'object' ? values((row as Row)[path[0]], path.slice(1)) : [undefined];
}
function matches(row: unknown, filter: Row): boolean {
    return Object.entries(filter).every(([path, expected]) => {
        if (path === '$or') return (expected as Row[]).some(part => matches(row, part));
        return values(row, path.split('.')).some(actual => {
            if (expected instanceof ObjectId) return String(actual) === expected.toString();
            if (expected && typeof expected === 'object') {
                const op = expected as Row;
                if ('$exists' in op) return (actual !== undefined) === op.$exists;
                if ('$ne' in op) return actual !== op.$ne;
                if ('$in' in op) return (op.$in as unknown[]).some(value => String(value) === String(actual));
                if ('$gte' in op && !(actual instanceof Date && actual >= (op.$gte as Date))) return false;
                if ('$lte' in op && !(actual instanceof Date && actual <= (op.$lte as Date))) return false;
                if ('$regex' in op) return new RegExp(String(op.$regex), String(op.$options ?? '')).test(String(actual ?? ''));
                return true;
            }
            return actual === expected;
        });
    });
}
function setup() {
    const state: State = { recordings: [], passages: [], db: {} as Db, ready: true, embeddingAvailable: true, vectorFails: false, embeddingCalls: 0 };
    state.db = { collection(name: string) { return {
        find(filter: Row) { let rows = state.recordings.filter(row => matches(row, filter)); const cursor = {
            sort(order: Record<string, number>) { rows.sort((a, b) => {
                for (const [field, direction] of Object.entries(order)) {
                    const left = a[field as keyof Recording], right = b[field as keyof Recording];
                    const comparison = left instanceof Date && right instanceof Date ? left.getTime() - right.getTime() : String(left).localeCompare(String(right));
                    if (comparison) return comparison * direction;
                }
                return 0;
            }); return cursor; },
            skip(skip: number) { rows = rows.slice(skip); return cursor; },
            limit(limit: number) { rows = rows.slice(0, limit); return cursor; }, async toArray() { return rows; },
        }; return cursor; },
        async countDocuments(filter: Row) { return state.recordings.filter(row => matches(row, filter)).length; },
        aggregate(pipeline: Record<string, unknown>[]) { return { async toArray() {
            if (name === 'recording_passages') { state.pipeline = pipeline; if (state.vectorFails) throw new Error('Search unavailable'); return state.passages; }
            const counts = new Map<string, { _id: { state: string; profileId: string }; count: number }>();
            for (const row of state.recordings.filter(item => matches(item, pipeline[0].$match as Row))) {
                const id = { state: row.searchIndex?.state ?? 'pending', profileId: row.searchIndex?.profileId ?? '' }, key = JSON.stringify(id);
                const old = counts.get(key); counts.set(key, { _id: id, count: (old?.count ?? 0) + 1 });
            }
            return [...counts.values()];
        } }; },
    }; } } as unknown as Db;
    world[key] = state; return state;
}
const hook = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/search/retrieval.ts')) {
        const global = "globalThis[Symbol.for('vosift.test.semantic-retrieval')]";
        const code = specifier === '@/lib/mongodb' ? `export const Collections={RECORDINGS:'recordings'};export async function getMongoDb(){return ${global}.db;}`
            : specifier === './profile' ? "export function embeddingProfile(){return {id:'profile',provider:'gemini',model:'fixture',dimensions:2};}"
            : specifier === './readiness' ? `export async function inspectSearchReadiness(){return {ready:${global}.ready};}`
            : specifier === '@/services/ai/search-embedding' ? `export async function getSearchEmbedding(){${global}.embeddingCalls++;return ${global}.embeddingAvailable?{embedding:[1,0]}:{embedding:[],fallbackReason:'processing_paused'};}`
            : specifier === '@/lib/db/recordings/hydrate-contacts' ? 'export async function hydrateRecordingContacts(owner,rows){return rows;}' : undefined;
        if (code) return { url: `data:text/javascript,${encodeURIComponent(code)}`, shortCircuit: true };
    }
    return next(specifier, context);
} });
const { retrieveRecordings, fuseRecordingRanks } = await import('./retrieval');
hook.deregister();
function recording(owner = 'owner', patch: Partial<Recording> = {}): Recording {
    return { _id: new ObjectId(), authSubject: owner, contactId: new ObjectId(), contactName: 'Maya', phoneNumber: '5554762',
        normalizedPhoneNumber: '5554762', r2Key: 'audio', fileName: 'call.mp3', standardizedDisplayName: 'Call', fileSize: 1, mimeType: 'audio/mpeg',
        duration: 120, recordedAt: new Date('2026-11-05T12:00:00Z'), createdAt: new Date(), updatedAt: new Date(),
        transcriptionStatus: 'completed', tags: [], isStarred: false, isArchived: false, summary: 'A short discussion.',
        fullTranscript: [{ speakerId: 'B', text: 'The monsoon delayed shipment until Friday afternoon.', start: 45, end: 60, words: [] }],
        searchIndex: { generation: 'generation', transcriptRevision: 'revision', profileId: 'profile', state: 'ready', totalPassages: 1, completedPassages: 1 }, ...patch };
}
function passage(row: Recording): RecordingPassage {
    return { _id: row._id.toString(), owner: row.authSubject, recordingId: row._id.toString(), generation: 'generation', transcriptRevision: 'revision',
        ordinal: 0, text: row.fullTranscript![0].text, sources: [{ segmentIndex: 0, from: 0, to: row.fullTranscript![0].text.length }], start: 45, end: 60,
        inputTokens: 20, profileId: 'profile', profile: { id: 'profile', provider: 'gemini', model: 'fixture', dimensions: 2, adapterVersion: 1, chunkerVersion: 1, countBasis: 'utf8_byte_bound' },
        contactId: row.contactId?.toString() ?? null, recordedAt: row.recordedAt, isArchived: false, published: true };
}

test('semantic passage retrieval returns a detail absent from summaries with source navigation and scoped filters', async () => {
    const state = setup(), owned = recording(); state.recordings.push(owned); state.passages.push(passage(owned));
    const result = await retrieveRecordings('owner', { query: 'When should the parcel arrive?', contactId: owned.contactId!.toString(), startDate: '2026-11-01', endDate: '2026-11-06' });
    assert.equal(result.mode, 'vector'); assert.equal(result.results[0]._id.toString(), owned._id.toString());
    assert.equal(result.resultLimit, 200);
    assert.equal(result.matches[owned._id.toString()][0].start, 45);
    assert.ok(result.matches[owned._id.toString()][0].text.includes('Friday'));
    assert.deepEqual(result.coverage, { ready: 1, pending: 0, failed: 0, total: 1 });
    const filter = (state.pipeline![0].$vectorSearch as Row).filter as Row;
    assert.equal(filter.owner, 'owner'); assert.equal(filter.contactId, owned.contactId!.toString()); assert.equal(filter.published, true);
    assert.deepEqual(filter.recordedAt, { $gte: new Date('2026-11-01'), $lte: new Date('2026-11-06T23:59:59.999Z') });
});

test('live source checks reject stale generations, archived calls, wrong contacts and other owners', async () => {
    const state = setup(), owned = recording(), foreign = recording('other-owner'), archived = recording('owner', { isArchived: true });
    const stale = recording('owner', { searchIndex: { ...owned.searchIndex!, generation: 'new-generation' } });
    state.recordings.push(owned, foreign, archived, stale); state.passages.push(...state.recordings.map(passage));
    const result = await retrieveRecordings('owner', { query: 'parcel arrival' });
    assert.deepEqual(result.results.map(row => row._id.toString()), [owned._id.toString()]);
    const filtered = await retrieveRecordings('owner', { query: 'parcel arrival', contactId: new ObjectId().toString() });
    assert.equal(filtered.results.length, 0);
});

test('an unavailable vector index uses labelled keyword retrieval without requesting query embeddings', async () => {
    const state = setup(); state.ready = false; const owned = recording(), foreign = recording('other-owner'); state.recordings.push(owned, foreign);
    const result = await retrieveRecordings('owner', { query: '5554762' });
    assert.equal(result.mode, 'fallback'); assert.equal(result.fallbackReason, 'vector_unavailable'); assert.equal(state.embeddingCalls, 0);
    assert.deepEqual(result.results.map(row => row._id.toString()), [owned._id.toString()]);
    assert.equal(result.resultLimit, undefined);
});

test('keyword fallback pages beyond 200 matching recordings with exact scoped counts', async t => {
    for (const reason of ['index_unavailable', 'embedding_unavailable', 'vector_query_failed']) await t.test(reason, async () => {
        const state = setup(), contactId = new ObjectId();
        state.ready = reason !== 'index_unavailable';
        state.embeddingAvailable = reason !== 'embedding_unavailable';
        state.vectorFails = reason === 'vector_query_failed';
        const rows = Array.from({ length: 205 }, (_, index) => recording('owner', {
            contactId, recordedAt: new Date(Date.UTC(2026, 10, 5, 12, 0, index)),
        }));
        state.recordings.push(...rows,
            recording('other-owner', { contactId }), recording('owner', { contactId, isArchived: true }),
            recording('owner'), recording('owner', { contactId, recordedAt: new Date('2025-01-01') }),
            recording('owner', { contactId, fullTranscript: [], summary: 'Unrelated conversation.' }));
        const collected: string[] = [];
        for (let page = 1; page <= 22; page++) {
            const result = await retrieveRecordings('owner', { query: 'shipment', contactId: contactId.toString(),
                startDate: '2026-11-05', endDate: '2026-11-05', page, pageSize: 10 });
            assert.equal(result.mode, 'fallback');
            assert.equal(result.fallbackReason, reason === 'embedding_unavailable' ? 'processing_paused' : 'vector_unavailable');
            assert.equal(result.totalCount, 205);
            assert.equal(result.hasMore, page < 21);
            assert.equal(result.results.length, page <= 20 ? 10 : page === 21 ? 5 : 0);
            assert.equal(result.resultLimit, undefined);
            for (const row of result.results) {
                collected.push(row._id.toString());
                assert.equal(result.matches[row._id.toString()][0].start, 45);
            }
        }
        assert.deepEqual(collected, rows.toReversed().map(row => row._id.toString()));
        assert.equal(new Set(collected).size, 205);
    });
});

test('rank fusion deduplicates recordings and rewards agreement without treating cosine scores as percentages', () => {
    assert.deepEqual(fuseRecordingRanks(['exact', 'both'], ['semantic', 'both', 'both']).map(row => row.id), ['both', 'exact', 'semantic']);
});

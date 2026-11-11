import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import type { Recording } from '@/lib/db/types';
import { embeddingProfile } from './profile';
import { passageVectorIndexDefinition } from './readiness';
import { PASSAGES_COLLECTION, PASSAGE_VECTOR_INDEX } from './passages';

const key = Symbol.for('vosift.test.vector-service');
const world = globalThis as typeof globalThis & { [key]?: { db: Db } };

/** Opt-in real Mongo Search acceptance. Uses synthetic vectors and no paid AI calls.
 * The dedicated URI must allow creation/deletion of a disposable database and search index. */
test('real passage vector search filters scope and returns full-transcript evidence', {
    skip: !process.env.VOSIFT_TEST_SEARCH_MONGODB_URI, timeout: 180_000,
}, async t => {
    const client = new MongoClient(process.env.VOSIFT_TEST_SEARCH_MONGODB_URI!, { serverSelectionTimeoutMS: 10_000 });
    const db = client.db(`vt_search_${randomUUID().replaceAll('-', '').slice(0, 16)}`);
    const saved = process.env.SEARCH_EMBEDDING_DIMENSIONS;
    let connected = false;
    let hook: ReturnType<typeof registerHooks> | undefined;
    try {
        process.env.SEARCH_EMBEDDING_DIMENSIONS = '2';
        await client.connect(); connected = true;
        await db.createCollection(PASSAGES_COLLECTION);
        const profile = embeddingProfile(), owner = `fixture-${randomUUID()}`, contactId = new ObjectId();
        const now = new Date('2026-11-05T12:00:00Z');
        const rows = [
            { id: new ObjectId(), owner, text: 'The shipment will arrive on Friday afternoon.', vector: [1, 0], start: 45 },
            { id: new ObjectId(), owner, text: 'A different conversation about quarterly invoices.', vector: [0, 1], start: 10 },
            { id: new ObjectId(), owner: 'another-owner', text: 'Private shipment details.', vector: [1, 0], start: 60 },
        ];
        for (const row of rows) {
            const recording: Recording = { _id: row.id, authSubject: row.owner, contactId, contactName: 'Fictional contact', phoneNumber: '', normalizedPhoneNumber: '',
                r2Key: 'fixture/no-audio', fileName: 'fictional.mp3', standardizedDisplayName: 'Fictional call', fileSize: 1, mimeType: 'audio/mpeg', duration: 120,
                recordedAt: now, createdAt: now, updatedAt: now, transcriptionStatus: 'completed', summary: 'A short discussion.', tags: [], isStarred: false, isArchived: false,
                fullTranscript: [{ speakerId: 'B', text: row.text, start: row.start, end: row.start + 10, words: [] }],
                searchIndex: { generation: 'generation', transcriptRevision: 'revision', profileId: profile.id, state: 'ready', totalPassages: 1, completedPassages: 1 } };
            await db.collection<Recording>('recordings').insertOne(recording);
            await db.collection(PASSAGES_COLLECTION).insertOne({ owner: row.owner, recordingId: row.id.toString(), generation: 'generation', transcriptRevision: 'revision',
                ordinal: 0, text: row.text, sources: [{ segmentIndex: 0, from: 0, to: row.text.length }], start: row.start, end: row.start + 10,
                profile, profileId: profile.id, inputTokens: 20, vector: row.vector, published: true, contactId: contactId.toString(), recordedAt: now, isArchived: false });
        }
        await db.collection(PASSAGES_COLLECTION).createSearchIndex({ name: PASSAGE_VECTOR_INDEX, type: 'vectorSearch', definition: passageVectorIndexDefinition(2) });
        const deadline = Date.now() + 120_000;
        const pipeline = [{ $vectorSearch: { index: PASSAGE_VECTOR_INDEX, path: 'vector', queryVector: [1, 0], numCandidates: 100, limit: 10,
            filter: { owner, profileId: profile.id, published: true, isArchived: false } } }];
        let indexed = false;
        while (Date.now() < deadline) {
            try { if ((await db.collection(PASSAGES_COLLECTION).aggregate(pipeline).toArray()).length >= 2) { indexed = true; break; } }
            catch { /* A newly created search index is not queryable immediately. */ }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        assert.equal(indexed, true, 'The isolated vector service must finish indexing the fixture');
        world[key] = { db };
        hook = registerHooks({ resolve(specifier, context, next) {
            if (specifier === '@/lib/mongodb') return { url: `data:text/javascript,${encodeURIComponent("export const Collections={RECORDINGS:'recordings',CONTACTS:'contacts'};export async function getMongoDb(){return globalThis[Symbol.for('vosift.test.vector-service')].db;}")}`, shortCircuit: true };
            if (specifier === '@/services/ai/search-embedding' && context.parentURL?.endsWith('/search/retrieval.ts')) return {
                url: 'data:text/javascript,export async function getSearchEmbedding(){return {embedding:[1,0]};}', shortCircuit: true,
            };
            return next(specifier, context);
        } });
        const { retrieveRecordings } = await import('./retrieval');
        const result = await retrieveRecordings(owner, { query: 'When should the parcel arrive?', contactId: contactId.toString(), startDate: '2026-11-01', endDate: '2026-11-06' });
        assert.equal(result.mode, 'vector');
        assert.equal(result.results[0]._id.toString(), rows[0].id.toString());
        assert.ok(result.results.every(row => row.authSubject === owner));
        assert.equal(result.matches[rows[0].id.toString()][0].start, 45);
        assert.ok(result.matches[rows[0].id.toString()][0].text.includes('Friday'));
        t.diagnostic('Verified actual MongoDB vector retrieval with isolated synthetic passage vectors; no provider relevance claim.');
    } finally {
        hook?.deregister(); delete world[key];
        if (saved === undefined) delete process.env.SEARCH_EMBEDDING_DIMENSIONS; else process.env.SEARCH_EMBEDDING_DIMENSIONS = saved;
        if (connected) await db.dropDatabase();
        await client.close();
    }
});

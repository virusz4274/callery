import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
import { MongoClient, ObjectId, type Db, type Document } from 'mongodb';
import type { Recording } from '@/lib/db/types';
import type { AiCallCheckpoint } from './ai-work-plan';

const stateKey = Symbol.for('vosift.test.enrichment-execution-mongo');
const state = globalThis as typeof globalThis & { [stateKey]?: Db };
// Only connection acquisition is replaced. Production MongoDB query/update
// filters, atomic writes and revision fencing are exercised unchanged.
const hook = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/transcription/execution.ts') && specifier === '@/lib/mongodb') return {
        url: `data:text/javascript,${encodeURIComponent(`export const Collections={RECORDINGS:'recordings'};export async function getMongoDb(){const db=globalThis[Symbol.for('vosift.test.enrichment-execution-mongo')];if(!db)throw new Error('Disposable test database is unavailable');return db;}`)}`,
        shortCircuit: true,
    };
    return next(specifier, context);
} });
const { updateEnrichmentCheckpoint, updateTranscriptionAttempt, updateLegacyTranscriptionResult } = await import('./execution');
hook.deregister();

function checkpoint(result: string): AiCallCheckpoint {
    return { attempts: 1, state: 'response_saved', reservationId: 'owned-ai-reservation', result,
        request: { version: 1, id: 'owned-summary-call', step: 'summary', provider: 'gemini', model: 'fixture-model',
            prompt: 'Fixture prompt', promptVersion: 'fixture-v1', inputTokens: 3, maxOutputTokens: 12,
            thinking: 'off', maximumCostMicros: 10 } };
}

async function recordingFixture(db: Db): Promise<Recording> {
    const now = new Date();
    const row: Recording = { _id: new ObjectId(), authSubject: `owned-${randomUUID()}`, contactId: null, contactName: null,
        phoneNumber: '', normalizedPhoneNumber: '', r2Key: 'fixture/enrichment', fileName: 'fictional-demo.mp3',
        standardizedDisplayName: 'Fictional demo', fileSize: 100, mimeType: 'audio/mpeg', duration: 60,
        recordedAt: now, createdAt: now, updatedAt: now, transcriptionStatus: 'processing', tags: [], isStarred: false,
        isArchived: false, transcriptionResultAttemptId: 'original-asr-result', transcriptionEnrichmentPending: true,
        fullTranscript: [{ speakerId: 'A', start: 0, end: 60, text: 'Fictional source text.', words: [] }] };
    await db.collection<Recording>('recordings').insertOne(row);
    return row;
}

test('real MongoDB enrichment checkpoints preserve payload atomicity and reject stale or orphaned writes', {
    skip: !process.env.VOSIFT_TEST_MONGODB_URI,
}, async t => {
    const client = new MongoClient(process.env.VOSIFT_TEST_MONGODB_URI!, { serverSelectionTimeoutMS: 15_000, monitorCommands: true });
    const db = client.db(`vt_enrichment_${randomUUID().replaceAll('-', '').slice(0, 20)}`);
    const updates: Document[] = [];
    client.on('commandStarted', event => { if (event.commandName === 'update' && event.command.update === 'recordings') updates.push(event.command); });
    let connected = false;
    try {
        await client.connect(); connected = true; state[stateKey] = db;
        await t.test('payload and response checkpoint are committed in one revision update', async () => {
            const previous = await recordingFixture(db), result = 'Saved summary';
            updates.length = 0;
            assert.equal(await updateEnrichmentCheckpoint(previous.authSubject, previous._id.toHexString(), previous,
                { summary: result, aiWorkCheckpoints: { summary: checkpoint(result) } }), 1);
            assert.equal(updates.length, 1);
            const write = updates[0].updates[0].u;
            assert.equal(write.$set.summary, result);
            assert.equal(write.$set.aiWorkCheckpoints.summary.result, result);
            assert.equal(write.$inc.aiWorkRevision, 1);
            const saved = await db.collection<Recording>('recordings').findOne({ _id: previous._id });
            assert.equal(saved?.summary, result);
            assert.equal(saved?.aiWorkCheckpoints?.summary.result, result);
            assert.equal(saved?.aiWorkRevision, 1);
        });

        await t.test('two responses racing the same revision have exactly one winner', async () => {
            const previous = await recordingFixture(db);
            const results = await Promise.allSettled(['First response', 'Second response'].map(result =>
                updateEnrichmentCheckpoint(previous.authSubject, previous._id.toHexString(), previous,
                    { summary: result, aiWorkCheckpoints: { summary: checkpoint(result) } })));
            assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
            const loser = results.find(result => result.status === 'rejected');
            assert.ok(loser?.status === 'rejected');
            assert.match(String(loser.reason), /newer processing checkpoint or transcript/);
            const saved = await db.collection<Recording>('recordings').findOne({ _id: previous._id });
            assert.equal(saved?.aiWorkRevision, 1);
            assert.equal(saved?.summary, results[0].status === 'fulfilled' ? 'First response' : 'Second response');
            assert.equal(saved?.aiWorkCheckpoints?.summary.result, saved?.summary);
        });

        for (const sameText of [false, true]) await t.test(`a late AI response cannot overwrite a new ASR result (${sameText ? 'identical text' : 'changed text'})`, async () => {
            const previous = await recordingFixture(db), execution = { jobId: 'new-asr-job', attemptId: randomUUID() };
            await db.collection<Recording>('recordings').updateOne({ _id: previous._id }, {
                $set: { transcriptionJobId: execution.jobId, transcriptionAttemptId: execution.attemptId },
            });
            await db.collection<{ _id: string; jobId: string; attemptId: string }>('transcription_dispatch').updateOne({ _id: 'transcription' }, { $set: execution }, { upsert: true });
            const transcript = sameText ? previous.fullTranscript! : [{ speakerId: 'A', start: 0, end: 60, text: 'New fictional transcript.', words: [] }];
            await updateTranscriptionAttempt(previous.authSubject, previous._id.toHexString(), execution, {
                fullTranscript: transcript, transcriptionResultAttemptId: execution.attemptId, summary: '', aiWorkPlan: null, aiWorkCheckpoints: {},
            });
            await assert.rejects(updateEnrichmentCheckpoint(previous.authSubject, previous._id.toHexString(), previous,
                { summary: 'Stale response', aiWorkCheckpoints: { summary: checkpoint('Stale response') } }), /newer processing checkpoint or transcript/);
            const saved = await db.collection<Recording>('recordings').findOne({ _id: previous._id });
            assert.deepEqual(saved?.fullTranscript, transcript);
            assert.equal(saved?.transcriptionResultAttemptId, execution.attemptId);
            assert.equal(saved?.summary, ''); assert.deepEqual(saved?.aiWorkCheckpoints, {});
        });

        await t.test('a response after content deletion cannot resurrect the recording', async () => {
            const previous = await recordingFixture(db);
            await db.collection<Recording>('recordings').deleteOne({ _id: previous._id });
            await assert.rejects(updateEnrichmentCheckpoint(previous.authSubject, previous._id.toHexString(), previous,
                { summary: 'Deleted response', aiWorkCheckpoints: { summary: checkpoint('Deleted response') } }), /newer processing checkpoint or transcript/);
            assert.equal(await db.collection('recordings').countDocuments({ _id: previous._id }), 0);
        });

        await t.test('a legacy callback cannot overwrite an attempted or recorrelated recording', async () => {
            const previous = await recordingFixture(db);
            await updateLegacyTranscriptionResult(previous.authSubject, previous._id.toHexString(), previous, { summary: 'Accepted original result' });
            await db.collection<Recording>('recordings').updateOne({ _id: previous._id }, { $set: { transcriptionAttemptId: 'new-attempt', transcriptionJobId: 'new-job' } });
            await assert.rejects(updateLegacyTranscriptionResult(previous.authSubject, previous._id.toHexString(), previous, { summary: 'Late old callback' }), /newer transcription attempt/);
            const saved = await db.collection<Recording>('recordings').findOne({ _id: previous._id });
            assert.equal(saved?.summary, 'Accepted original result');
        });

        await t.test('losing the shared dispatcher lease rejects an otherwise current response', async () => {
            const previous = await recordingFixture(db), execution = { jobId: 'owned-job', attemptId: 'owned-attempt' };
            await db.collection<Recording>('recordings').updateOne({ _id: previous._id }, { $set: {
                transcriptionJobId: execution.jobId, transcriptionAttemptId: execution.attemptId,
            } });
            await db.collection<{ _id: string; jobId: string; attemptId: string }>('transcription_dispatch').updateOne({ _id: 'transcription' }, {
                $set: { jobId: 'replacement-job', attemptId: 'replacement-attempt' },
            }, { upsert: true });
            updates.length = 0;
            await assert.rejects(updateEnrichmentCheckpoint(previous.authSubject, previous._id.toHexString(), previous,
                { summary: 'Late response', aiWorkCheckpoints: { summary: checkpoint('Late response') } }, execution), /no longer active/);
            assert.equal(updates.length, 0, 'A lost lease cannot issue a recording write');
            const saved = await db.collection<Recording>('recordings').findOne({ _id: previous._id });
            assert.equal(saved?.summary, undefined); assert.equal(saved?.aiWorkRevision, undefined);
        });
    } finally {
        try { if (connected) await db.dropDatabase(); }
        finally { delete state[stateKey]; await client.close(); }
    }
});

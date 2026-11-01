import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import type { Recording } from '@/lib/db/types';
import type { ManualTranscriptionOptions, TranscriptionExecution } from '@/lib/transcription/manual';
import type { TranscriptionBatch } from '@/lib/transcription/batch-types';
import type { IngestionJob } from './jobs';
import { createTranscriptionBatch, updateTranscriptionBatch } from '@/lib/transcription/batches';

type RunnerResult = { success: true } | { error: string };
interface RunnerState {
    db: Db;
    calls: { owner: string; recordingId: string; execution: TranscriptionExecution }[];
    handler: (owner: string, recordingId: string, execution: TranscriptionExecution) => Promise<RunnerResult>;
    run: (owner: string, recordingId: string, options: ManualTranscriptionOptions, execution: TranscriptionExecution) => Promise<RunnerResult>;
}
const key = Symbol.for('vosift.test.transcription-dispatcher');
const globalState = globalThis as typeof globalThis & { [key]: RunnerState };
// Keep the real MongoDB dispatcher and replace only the paid provider runner.
const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
        if (context.parentURL?.endsWith('/integrations/jobs.ts') && specifier === '@/lib/transcription/manual') return {
            url: `data:text/javascript,${encodeURIComponent(`export async function validateTranscriptionRequest(){return {success:true};} export async function executeTranscription(...args) { return globalThis[Symbol.for('vosift.test.transcription-dispatcher')].run(...args); }`)}`,
            shortCircuit: true,
        };
        return nextResolve(specifier, context);
    },
});
const { batchJobId, enqueueTranscription, processTranscriptionJobs, queueDeferredTranscriptionCompletion, resetBatchJobsForRetry, settleQueuedTranscription } = await import('./jobs');
hook.deregister();

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    return { promise, resolve };
}

async function recordingFixture(db: Db, owner: string, count: number, bulk = false) {
    await db.collection('users').insertOne({ authSubject: owner, disabled: false, planKey: 'starter', transcriptionUsed: 0,
        transcriptionAllocation: 100_000, transcriptionSettings: { autoTranscribe: true, defaultProvider: 'gemini' }, billingSettings: { allowOverage: false } });
    const recordings = Array.from({ length: count }, (_, index): Recording => ({
        _id: new ObjectId(), authSubject: owner, contactId: null, contactName: null, phoneNumber: '', normalizedPhoneNumber: '',
        r2Key: `fixture/${owner}/${index}`, fileName: `call-${index}.mp3`, standardizedDisplayName: `Call ${index}`,
        fileSize: 100, mimeType: 'audio/mpeg', duration: 60, recordedAt: new Date(Date.UTC(2026, 9, 18, 10, index)),
        createdAt: new Date(), updatedAt: new Date(), transcriptionStatus: 'pending', tags: [], isStarred: false, isArchived: false,
        ...(bulk ? { bulkImportId: `import-${owner}`, recordingDateKey: '2026-10-18' } : {}),
    }));
    await db.collection<Recording>('recordings').insertMany(recordings);
    return recordings;
}

async function reset(db: Db) {
    await db.dropDatabase();
    const state: RunnerState = {
        db, calls: [],
        handler: async (owner, recordingId) => {
            await db.collection<Recording>('recordings').updateOne({ _id: new ObjectId(recordingId), authSubject: owner }, { $set: { transcriptionStatus: 'completed', transcriptionEnrichmentPending: false } });
            return { success: true };
        },
        run: async (owner, recordingId, _options, execution) => {
            assert.ok(execution.jobId);
            assert.ok(execution.attemptId);
            state.calls.push({ owner, recordingId, execution });
            await db.collection<Recording>('recordings').updateOne({ _id: new ObjectId(recordingId), authSubject: owner }, { $set: {
                transcriptionStatus: 'processing', transcriptionJobId: execution.jobId, transcriptionAttemptId: execution.attemptId,
            } });
            return state.handler(owner, recordingId, execution);
        },
    };
    globalState[key] = state;
    return state;
}

test('the durable transcription dispatcher serializes approved work and reconciles its exact attempt', {
    skip: !process.env.VOSIFT_TEST_MONGODB_URI,
}, async t => {
    const client = new MongoClient(process.env.VOSIFT_TEST_MONGODB_URI!);
    await client.connect();
    const db = client.db(`vt_dispatch_${randomUUID().replaceAll('-', '').slice(0, 20)}`);
    try {
        await t.test('a late result durably hands enrichment back to the queue without taking another account slot', async () => {
            const fixture = await reset(db);
            const [recording] = await recordingFixture(db, 'late-fixture', 1);
            const jobs = db.collection<IngestionJob>('integration_jobs');
            const slot = db.collection<{ _id: string; jobId: string; attemptId: string; until: Date }>('transcription_dispatch');
            const execution = { jobId: `manual:${recording._id}`, attemptId: 'original-provider-attempt' };
            await enqueueTranscription(recording.authSubject, recording._id.toHexString(), {}, execution.jobId, false, db);
            await jobs.updateOne({ _id: execution.jobId }, { $set: { state: 'needs_review', attemptId: execution.attemptId, error: 'Original timeout' } });
            const source = [{ speakerId: 'A', text: 'Saved owned source', words: [] }];
            await db.collection<Recording>('recordings').updateOne({ _id: recording._id }, { $set: {
                transcriptionStatus: 'pending', transcriptionJobId: execution.jobId, transcriptionAttemptId: execution.attemptId,
                transcriptionResultAttemptId: execution.attemptId, transcriptionEnrichmentPending: true, fullTranscript: source, transcriptionCompletionPending: execution,
            } });
            await slot.insertOne({ _id: 'transcription', jobId: 'another-account-job', attemptId: 'other-attempt', until: new Date(Date.now() + 600_000) });
            await queueDeferredTranscriptionCompletion(recording.authSubject, recording._id.toHexString(), execution, db);
            assert.equal((await jobs.findOne({ _id: execution.jobId }))?.state, 'pending');
            assert.equal((await slot.findOne({ _id: 'transcription' }))?.jobId, 'another-account-job');
            assert.equal(await processTranscriptionJobs(1, db), 0);assert.equal(fixture.calls.length, 0);
            const saved = await db.collection<Recording>('recordings').findOne({ _id: recording._id });
            assert.deepEqual(saved?.fullTranscript, source);assert.equal(saved?.transcriptionCompletionPending, undefined);
            const job = await jobs.findOne({ _id: execution.jobId });
            assert.equal(job?.attemptHistory?.[0].error, 'Original timeout');
            // Model a crash immediately after transcript acceptance, before the
            // handoff above could finish. Cron repairs it without another ASR call.
            await slot.deleteMany({});
            await jobs.updateOne({ _id: execution.jobId }, { $set: { state: 'needs_review' } });
            await db.collection<Recording>('recordings').updateOne({ _id: recording._id }, { $set: { transcriptionCompletionPending: execution } });
            fixture.handler = async (owner, id) => {
                const accepted = await db.collection<Recording>('recordings').findOne({ _id: new ObjectId(id), authSubject: owner });
                assert.equal(accepted?.transcriptionEnrichmentPending, true);assert.deepEqual(accepted?.fullTranscript, source);
                await db.collection<Recording>('recordings').updateOne({ _id: recording._id }, { $set: { transcriptionStatus: 'completed', transcriptionEnrichmentPending: false } });
                return { success: true };
            };
            assert.equal(await processTranscriptionJobs(1, db), 1);assert.equal(fixture.calls.length, 1);
        });

        await t.test('simultaneous workers share one slot and never overlap pipelines', async () => {
            const state = await reset(db);
            const recordings = await recordingFixture(db, 'parallel', 2);
            for (const recording of recordings) await enqueueTranscription('parallel', recording._id.toHexString(), { provider: 'gemini' }, `manual:${recording._id}`, false, db);
            const entered = deferred();
            const finish = deferred();
            const complete = state.handler;
            state.handler = async (...args) => { entered.resolve(); await finish.promise; return complete(...args); };
            const first = processTranscriptionJobs(1, db);
            await entered.promise;
            assert.equal(await processTranscriptionJobs(1, db), 0);
            assert.equal(state.calls.length, 1);
            finish.resolve();
            assert.equal(await first, 1);
            assert.equal(await processTranscriptionJobs(1, db), 1);
            assert.equal(state.calls.length, 2);
            assert.equal(await db.collection('integration_jobs').countDocuments({ state: 'completed' }), 2);
        });

        await t.test('paused batches submit no further recordings and a finished selection leaves drafts waiting', async () => {
            const state = await reset(db);
            const recordings = await recordingFixture(db, 'batches', 4, true);
            const approved = await createTranscriptionBatch('batches', { recordingIds: recordings.slice(0, 2).map(recording => recording._id.toHexString()), provider: 'gemini' }, db);
            const later = await createTranscriptionBatch('batches', { recordingIds: [recordings[2]._id.toHexString()], provider: 'gemini' }, db);
            await updateTranscriptionBatch('batches', approved.id, { action: 'start' }, db);
            const complete = state.handler;
            state.handler = async (...args) => {
                await updateTranscriptionBatch('batches', approved.id, { action: 'pause' }, db);
                return complete(...args);
            };
            assert.equal(await processTranscriptionJobs(10, db), 1);
            assert.equal(state.calls.length, 1);
            assert.equal(await db.collection('integration_jobs').countDocuments({ batchId: approved.id, state: 'pending' }), 1);
            assert.equal(await processTranscriptionJobs(10, db), 0);
            state.handler = complete;
            await updateTranscriptionBatch('batches', approved.id, { action: 'resume' }, db);
            assert.equal(await processTranscriptionJobs(10, db), 1);
            const batch = await db.collection<TranscriptionBatch>('transcription_batches').findOne({ _id: approved.id });
            assert.equal(batch?.status, 'completed');
            assert.equal((await db.collection<TranscriptionBatch>('transcription_batches').findOne({ _id: later.id }))?.status, 'draft');
            assert.equal(await db.collection('integration_jobs').countDocuments({ batchId: later.id }), 0);
            assert.equal((await db.collection<Recording>('recordings').findOne({ _id: recordings[3]._id }))?.transcriptionStatus, 'pending');
        });

        await t.test('async submission holds the slot through the callback; stale callbacks cannot release a newer attempt', async () => {
            const state = await reset(db);
            const recordings = await recordingFixture(db, 'async', 2);
            for (const recording of recordings) await enqueueTranscription('async', recording._id.toHexString(), { provider: 'gemini' }, `manual:${recording._id}`, false, db);
            state.handler = async (owner, recordingId) => {
                await db.collection<Recording>('recordings').updateOne({ _id: new ObjectId(recordingId), authSubject: owner }, { $set: { externalTranscriptionId: `external-${recordingId}` } });
                return { success: true };
            };
            assert.equal(await processTranscriptionJobs(10, db), 1);
            const first = state.calls[0];
            assert.equal((await db.collection<IngestionJob>('integration_jobs').findOne({ _id: first.execution.jobId }))?.state, 'submitted');
            await db.collection('transcription_dispatch').updateOne({}, { $set: { until: new Date(0) } });
            assert.equal(await processTranscriptionJobs(10, db), 0);
            assert.equal(state.calls.length, 1);
            await db.collection<Recording>('recordings').updateOne({ _id: new ObjectId(first.recordingId) }, { $set: { transcriptionStatus: 'completed' } });
            await settleQueuedTranscription('async', first.recordingId, first.execution, db);
            assert.equal(await processTranscriptionJobs(1, db), 1);
            const second = state.calls[1];
            await settleQueuedTranscription('async', first.recordingId, first.execution, db);
            const slot = await db.collection('transcription_dispatch').findOne({});
            assert.equal(slot?.jobId, second.execution.jobId);
            assert.equal(slot?.attemptId, second.execution.attemptId);
            await db.collection<Recording>('recordings').updateOne({ _id: new ObjectId(second.recordingId) }, { $set: { transcriptionStatus: 'completed' } });
            await settleQueuedTranscription('async', second.recordingId, second.execution, db);
        });

        await t.test('expired uncertain executions stop for review and never silently resubmit', async () => {
            const state = await reset(db);
            const [recording] = await recordingFixture(db, 'uncertain', 1, true);
            const batch = await createTranscriptionBatch('uncertain', { recordingIds: [recording._id.toHexString()], provider: 'gemini' }, db);
            await updateTranscriptionBatch('uncertain', batch.id, { action: 'start' }, db);
            const jobId = batchJobId(batch.id, recording._id.toHexString());
            await enqueueTranscription('uncertain', recording._id.toHexString(), { provider: 'gemini', model: batch.model }, jobId, false, db, batch.id);
            await db.collection<IngestionJob>('integration_jobs').updateOne({ _id: jobId }, { $set: { state: 'running', attemptId: 'old-attempt', leaseUntil: new Date(0) } });
            await db.collection<Recording>('recordings').updateOne({ _id: recording._id }, { $set: { transcriptionStatus: 'processing', transcriptionJobId: jobId, transcriptionAttemptId: 'old-attempt' } });
            await db.collection<{ _id: string; jobId: string; attemptId: string; until: Date }>('transcription_dispatch').insertOne({ _id: 'transcription', jobId, attemptId: 'old-attempt', until: new Date(0) });
            assert.equal(await processTranscriptionJobs(10, db), 0);
            assert.equal(state.calls.length, 0);
            assert.equal((await db.collection<IngestionJob>('integration_jobs').findOne({ _id: jobId }))?.state, 'needs_review');
            assert.equal((await db.collection<TranscriptionBatch>('transcription_batches').findOne({ _id: batch.id }))?.status, 'needs_review');
            assert.equal(await processTranscriptionJobs(10, db), 0);
        });

        await t.test('retry requires all failures and explicit acknowledgment while retaining transcript checkpoints', async () => {
            const state = await reset(db);
            const recordings = await recordingFixture(db, 'retry', 2, true);
            const batch = await createTranscriptionBatch('retry', { recordingIds: recordings.map(recording => recording._id.toHexString()), provider: 'gemini' }, db);
            await updateTranscriptionBatch('retry', batch.id, { action: 'start' }, db);
            for (const recording of recordings) {
                const jobId = batchJobId(batch.id, recording._id.toHexString());
                await enqueueTranscription('retry', recording._id.toHexString(), { provider: 'gemini', model: batch.model }, jobId, false, db, batch.id);
                await db.collection<IngestionJob>('integration_jobs').updateOne({ _id: jobId }, { $set: { state: 'needs_review', attemptId: 'old-attempt' } });
                await db.collection<Recording>('recordings').updateOne({ _id: recording._id }, { $set: {
                    transcriptionStatus: 'failed', transcriptionJobId: jobId, transcriptionAttemptId: 'old-attempt',
                    transcriptionEnrichmentPending: true, transcriptionEnrichmentSteps: { summary: true },
                    fullTranscript: [{ speakerId: 'Speaker 1', text: 'Saved transcript', words: [] }], summary: 'Saved summary',
                } });
            }
            await db.collection<TranscriptionBatch>('transcription_batches').updateOne({ _id: batch.id }, { $set: { status: 'needs_review' } });
            const ids = recordings.map(recording => recording._id.toHexString());
            await assert.rejects(updateTranscriptionBatch('retry', batch.id, { action: 'retry', recordingIds: ids }, db), /Acknowledge/);
            await assert.rejects(resetBatchJobsForRetry('retry', batch.id, ids.slice(0, 1), db), /all failed/);
            assert.equal(await db.collection('integration_jobs').countDocuments({ state: 'pending' }), 0);
            const resumed = await updateTranscriptionBatch('retry', batch.id, { action: 'retry', recordingIds: ids, acknowledgeProviderOutcome: true }, db);
            assert.equal(resumed.batch?.status, 'running');
            for (const recording of recordings) {
                const saved = await db.collection<Recording>('recordings').findOne({ _id: recording._id });
                assert.equal(saved?.fullTranscript?.[0].text, 'Saved transcript');
                assert.equal(saved?.summary, 'Saved summary');
                assert.deepEqual(saved?.transcriptionEnrichmentSteps, { summary: true });
                assert.equal(saved?.transcriptionEnrichmentPending, true);
            }
            assert.equal(state.calls.length, 0);
        });
    } finally { await db.dropDatabase(); await client.close(); }
});

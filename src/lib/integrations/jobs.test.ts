import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { MongoServerError, ObjectId, type Db } from 'mongodb';
import type { TranscriptionExecution } from '@/lib/transcription/manual';
import { LEGACY_AI_BUDGET_REJECTION, ProcessingError } from '@/lib/transcription/processing-errors';
import type { Recording } from '@/lib/db/types';

type Row = Record<string, unknown>;
// This stateful boundary double exercises dispatcher decisions and claim filters.
// Actual MongoDB atomicity, indexes and leases require jobs.integration.test.ts.
function copy<T>(value: T): T {
    if (value instanceof ObjectId) return new ObjectId(value.toHexString()) as T;
    if (value instanceof Date) return new Date(value) as T;
    if (Array.isArray(value)) return value.map(copy) as T;
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) as T;
    return value;
}
function equal(left: unknown, right: unknown): boolean {
    if (left instanceof ObjectId || right instanceof ObjectId) return left instanceof ObjectId && right instanceof ObjectId && left.equals(right);
    if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
    if (Array.isArray(left) && !Array.isArray(right)) return left.some(item => equal(item, right));
    return left === right;
}
function matches(row: Row, filter: Row): boolean {
    return Object.entries(filter).every(([field, expected]) => {
        if (field === '$or') return (expected as Row[]).some(branch => matches(row, branch));
        if (field === '$and') return (expected as Row[]).every(branch => matches(row, branch));
        const actual = field.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Row)[part] : undefined, row);
        if (expected && typeof expected === 'object' && !(expected instanceof Date) && !(expected instanceof ObjectId)) {
            return Object.entries(expected as Row).every(([operator, operand]) => {
                if (operator === '$exists') return (actual !== undefined) === operand;
                if (operator === '$in') return (operand as unknown[]).some(item => equal(actual, item));
                if (operator === '$nin') return !(operand as unknown[]).some(item => equal(actual, item));
                if (operator === '$ne') return !equal(actual, operand);
                if (operator === '$type') return operand === 'string' && typeof actual === 'string';
                if (operator === '$lte') return actual !== undefined && Number(actual) <= Number(operand);
                if (operator === '$lt') return actual !== undefined && Number(actual) < Number(operand);
                if (operator === '$gte') return actual !== undefined && Number(actual) >= Number(operand);
                if (operator === '$gt') return actual !== undefined && Number(actual) > Number(operand);
                throw new Error(`Unsupported test query operator ${operator}`);
            });
        }
        return equal(actual, expected);
    });
}
function patch(row: Row, update: Row, inserting = false) {
    Object.assign(row, copy(update.$set as Row || {}), inserting ? copy(update.$setOnInsert as Row || {}) : {});
    for (const field of Object.keys(update.$unset as Row || {})) delete row[field];
}
class Rows {
    values: Row[] = [];
    find(filter: Row = {}) {
        let values = this.values.filter(row => matches(row, filter));
        const cursor = {
            sort: (_sort: Row) => cursor,
            limit: (limit: number) => { values = values.slice(0, limit); return cursor; },
            project: (_projection: Row) => cursor,
            toArray: async () => values.map(copy),
            async *[Symbol.asyncIterator]() { for (const row of values) yield copy(row); },
        };
        return cursor;
    }
    async findOne(filter: Row = {}) { return copy(this.values.find(row => matches(row, filter)) || null); }
    async countDocuments(filter: Row = {}) { return this.values.filter(row => matches(row, filter)).length; }
    async distinct(field: string, filter: Row = {}) { return [...new Set(this.values.filter(row => matches(row, filter)).map(row => row[field]))]; }
    async insertOne(row: Row) { this.values.push(copy(row)); return { insertedId: row._id }; }
    async findOneAndUpdate(filter: Row, update: Row, options: { upsert?: boolean; returnDocument?: string } = {}) {
        let row = this.values.find(candidate => matches(candidate, filter));
        const before = copy(row || null);
        if (!row && options.upsert) {
            if (this.values.some(candidate => equal(candidate._id, filter._id))) throw new MongoServerError({ message: 'duplicate', code: 11000 });
            row = Object.fromEntries(Object.entries(filter).filter(([, value]) => !value || typeof value !== 'object'));
            patch(row, update, true);
            this.values.push(row);
        } else if (row) patch(row, update);
        return options.returnDocument === 'after' ? copy(row || null) : before;
    }
    async updateOne(filter: Row, update: Row, options: { upsert?: boolean } = {}) {
        const matched = this.values.find(row => matches(row, filter));
        const before = matched ? JSON.stringify(matched) : undefined;
        await this.findOneAndUpdate(filter, update, options);
        return { matchedCount: matched ? 1 : 0, modifiedCount: matched && before !== JSON.stringify(matched) ? 1 : 0, upsertedCount: !matched && options.upsert ? 1 : 0 };
    }
    async updateMany(filter: Row, update: Row) {
        const matching = this.values.filter(row => matches(row, filter));
        for (const row of matching) patch(row, update);
        return { matchedCount: matching.length };
    }
    async deleteOne(filter: Row) { const index = this.values.findIndex(row => matches(row, filter)); if (index >= 0) this.values.splice(index, 1); }
}
class MemoryDatabase {
    tables = new Map<string, Rows>();
    collection(name: string) { let table = this.tables.get(name); if (!table) { table = new Rows(); this.tables.set(name, table); } return table; }
    asDb() { return this as unknown as Db; }
}

interface RunnerState {
    database: MemoryDatabase;
    calls: { owner: string; recordingId: string; execution: TranscriptionExecution }[];
    complete: boolean;
    onRun?: () => Promise<void>;
}
const stateKey = Symbol.for('vosift.test.queue-unit');
const shared = globalThis as typeof globalThis & { [stateKey]: RunnerState };
const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
        if (context.parentURL?.endsWith('/integrations/jobs.ts') && specifier === './database') return {
            url: `data:text/javascript,${encodeURIComponent(`export const IntegrationCollections={jobs:'integration_jobs'}; export async function integrationDb(){return globalThis[Symbol.for('vosift.test.queue-unit')].database.asDb();}`)}`, shortCircuit: true,
        };
        if (context.parentURL?.endsWith('/integrations/jobs.ts') && specifier === '@/lib/transcription/manual') return {
            url: `data:text/javascript,${encodeURIComponent(`export async function validateTranscriptionRequest(){return {success:true};} export async function executeTranscription(owner, recordingId, options, execution) {
                const state = globalThis[Symbol.for('vosift.test.queue-unit')];
                state.calls.push({ owner, recordingId, execution });
                const rows = state.database.collection('recordings').values;
                const row = rows.find(row => row._id.toString() === recordingId && row.authSubject === owner);
                Object.assign(row, { transcriptionJobId: execution.jobId, transcriptionAttemptId: execution.attemptId, transcriptionStatus: state.complete ? 'completed' : 'processing', externalTranscriptionId: 'provider-' + recordingId });
                await state.onRun?.();
                return { success: true };
            }`)}`,
            shortCircuit: true,
        };
        return nextResolve(specifier, context);
    },
});
const { batchJobId, beginQueuedWebhookExecution, enqueueTranscription, processTranscriptionJobs, queueDeferredTranscriptionCompletion, requestTranscription, resetBatchJobsForRetry, settleQueuedTranscription } = await import('./jobs');
hook.deregister();

function setup(count: number) {
    const database = new MemoryDatabase();
    const state: RunnerState = { database, calls: [], complete: true };
    shared[stateKey] = state;
    database.collection('users').values.push({ authSubject: 'owner', transcriptionSettings: { autoTranscribe: true } });
    const recordings = Array.from({ length: count }, () => ({ _id: new ObjectId(), authSubject: 'owner', transcriptionStatus: 'pending', updatedAt: new Date() }));
    database.collection('recordings').values.push(...recordings);
    return { state, database, db: database.asDb(), recordings };
}

test('a deterministic summary funding block is failed with a resume action, not an uncertain provider review', async () => {
    const { state, database, db, recordings } = setup(1);
    const id = recordings[0]._id.toString();
    await enqueueTranscription('owner', id, {}, `manual:${id}`, false, db);
    const details = { stage: 'summary', state: 'blocked', code: 'ai_budget_exhausted', retryAction: 'resume_enrichment', providerOutcome: 'not_started' } as const;
    state.onRun = async () => { throw new ProcessingError('The accepted AI budget is insufficient.', details); };
    await processTranscriptionJobs(1, db);
    const job = database.collection('integration_jobs').values[0];
    assert.equal(job.state, 'failed');
    assert.deepEqual(job.processingStatus, details);
});

test('proved legacy local enrichment exhaustion resumes without unknown-provider acknowledgement and preserves its original attempt', async () => {
    const { state, database, db, recordings } = setup(1);
    const recording = recordings[0] as unknown as Recording;
    Object.assign(recording, { transcriptionStatus: 'failed', transcriptionEnrichmentPending: true,
        fullTranscript: [{ speakerId: 'A', text: 'Saved', words: [] }],
        transcriptionReceipt: { readyAt: new Date() } });
    const id = recording._id.toString(), jobId = `manual:${id}`;
    await enqueueTranscription('owner', id, {}, jobId, false, db);
    Object.assign(database.collection('integration_jobs').values[0], { state: 'needs_review', attemptId: 'old-budget-attempt', error: LEGACY_AI_BUDGET_REJECTION });
    await requestTranscription('owner', recording, {});
    const job = database.collection('integration_jobs').values[0];
    assert.equal(job.state, 'pending');
    assert.equal(job.attemptId, undefined);
    assert.deepEqual((job.attemptHistory as Row[]).map(entry => [entry.attemptId, entry.state, entry.error]),
        [['old-budget-attempt', 'needs_review', LEGACY_AI_BUDGET_REJECTION]]);
    assert.equal(recording.transcriptionReceipt?.readyAt instanceof Date, true);
    assert.equal(recording.fullTranscript?.[0].text, 'Saved');
    assert.equal(state.calls.length, 0, 'Requeue admission does not call a provider');
});

test('saved audio and a local-looking message never hide another uncertain AI or audio attempt', async () => {
    const { database, db, recordings } = setup(1);
    const recording = recordings[0] as unknown as Recording;
    Object.assign(recording, { transcriptionStatus: 'failed', transcriptionEnrichmentPending: true,
        fullTranscript: [{ speakerId: 'A', text: 'Saved', words: [] }], transcriptionReceipt: { readyAt: new Date() } });
    const id = recording._id.toString();
    await enqueueTranscription('owner', id, {}, `manual:${id}`, false, db);
    Object.assign(database.collection('integration_jobs').values[0], { state: 'needs_review', attemptId: 'legacy-budget', error: LEGACY_AI_BUDGET_REJECTION });
    await enqueueTranscription('owner', id, {}, `auto:${id}`, true, db);
    Object.assign(database.collection('integration_jobs').values[1], { state: 'needs_review', attemptId: 'uncertain', error: 'Provider connection lost' });
    await assert.rejects(requestTranscription('owner', recording, {}), /provider outcome is uncertain/);
    assert.equal(database.collection('integration_jobs').values[0].state, 'needs_review');
    assert.equal(database.collection('integration_jobs').values[1].state, 'needs_review');
});

test('retry history is bounded by refusing more attempts instead of discarding prior outcomes', async () => {
    const { database, db, recordings } = setup(1);
    const recording = recordings[0] as unknown as Recording;
    recording.transcriptionStatus = 'failed';
    const id = recording._id.toString();
    await enqueueTranscription('owner', id, {}, `manual:${id}`, false, db);
    const job = database.collection('integration_jobs').values[0];
    Object.assign(job, { state: 'failed', attemptId: 'last-attempt', error: 'Known rejection',
        attemptHistory: Array.from({ length: 32 }, (_, n) => ({ attemptId: `prior-${n}`, state: 'failed' })) });
    await assert.rejects(requestTranscription('owner', recording, {}), /history is full/);
    assert.equal(job.state, 'failed'); assert.equal(job.attemptId, 'last-attempt');
    assert.equal((job.attemptHistory as unknown[]).length, 32);
});

test('callback/job reconciliation preserves a known blocked enrichment outcome', async () => {
    const { database, db, recordings } = setup(1);
    const id = recordings[0]._id.toString(), jobId = `manual:${id}`, attemptId = 'accepted';
    await enqueueTranscription('owner', id, {}, jobId, false, db);
    const details = { stage: 'transliteration', state: 'blocked', code: 'ai_budget_exhausted', retryAction: 'resume_enrichment', providerOutcome: 'not_started' } as const;
    Object.assign(database.collection('integration_jobs').values[0], { state: 'running', attemptId });
    Object.assign(recordings[0], { transcriptionStatus: 'failed', transcriptionJobId: jobId, transcriptionAttemptId: attemptId,
        transcriptionEnrichmentPending: true, processingStatus: details });
    await settleQueuedTranscription('owner', id, { jobId, attemptId }, db);
    const job = database.collection('integration_jobs').values[0];
    assert.equal(job.state, 'failed'); assert.deepEqual(job.processingStatus, details);
});

test('simultaneous worker calls cannot enter a second recording pipeline', async () => {
    const { state, db, recordings } = setup(2);
    for (const recording of recordings) await enqueueTranscription('owner', recording._id.toString(), {}, `manual:${recording._id}`, false, db);
    let entered!: () => void;
    let finish!: () => void;
    const running = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { finish = resolve; });
    state.complete = false;
    state.onRun = async () => { entered(); await gate; };
    const first = processTranscriptionJobs(1, db);
    await running;
    assert.equal(await processTranscriptionJobs(1, db), 0);
    assert.equal(state.calls.length, 1);
    finish();
    assert.equal(await first, 1);
});

test('queue keeps async work in its shared slot until the matching callback completes', async () => {
    const { state, database, db, recordings } = setup(2);
    state.complete = false;
    for (const recording of recordings) await enqueueTranscription('owner', recording._id.toString(), {}, `manual:${recording._id}`, false, db);
    assert.equal(await processTranscriptionJobs(10, db), 1);
    const first = state.calls[0];
    assert.equal(await processTranscriptionJobs(10, db), 0);
    assert.equal(state.calls.length, 1);
    database.collection('recordings').values.find(row => row._id!.toString() === first.recordingId)!.transcriptionStatus = 'completed';
    await settleQueuedTranscription('owner', first.recordingId, first.execution, db);
    assert.equal(await processTranscriptionJobs(1, db), 1);
    const second = state.calls[1];
    await settleQueuedTranscription('owner', first.recordingId, first.execution, db);
    assert.equal(database.collection('transcription_dispatch').values[0].jobId, second.execution.jobId);
});

test('queue observes pause between recordings and never starts unapproved dates or saved batches', async () => {
    const { state, database, db, recordings } = setup(4);
    const ids = recordings.map(recording => recording._id.toString());
    const batch = { _id: 'approved', owner: 'owner', status: 'running', provider: 'gemini', model: 'test', recordingIds: ids.slice(0, 2) };
    database.collection('transcription_batches').values.push(batch, { _id: 'saved', owner: 'owner', status: 'draft', recordingIds: [ids[2]] });
    state.onRun = async () => { batch.status = 'paused'; };
    assert.equal(await processTranscriptionJobs(10, db), 1);
    assert.equal(state.calls.length, 1);
    assert.equal(await processTranscriptionJobs(10, db), 0);
    batch.status = 'running';
    state.onRun = undefined;
    assert.equal(await processTranscriptionJobs(10, db), 1);
    assert.equal(batch.status, 'completed');
    assert.deepEqual(new Set(state.calls.map(call => call.recordingId)), new Set(ids.slice(0, 2)));
    assert.equal(database.collection('integration_jobs').values.some(job => [ids[2], ids[3]].includes(String(job.recordingId))), false);
});

test('interrupted unknown provider outcomes require review and preserve saved enrichment on retry', async () => {
    const { state, database, db, recordings } = setup(1);
    const id = recordings[0]._id.toString();
    const jobId = batchJobId('review', id);
    database.collection('transcription_batches').values.push({ _id: 'review', owner: 'owner', status: 'running', provider: 'gemini', model: 'test', recordingIds: [id] });
    await enqueueTranscription('owner', id, { provider: 'gemini', model: 'test' }, jobId, false, db, 'review');
    Object.assign(database.collection('integration_jobs').values[0], { state: 'running', attemptId: 'old', leaseUntil: new Date(0) });
    Object.assign(recordings[0], { transcriptionStatus: 'processing', transcriptionJobId: jobId, transcriptionAttemptId: 'old', transcriptionEnrichmentPending: true, fullTranscript: ['Saved transcript'], summary: 'Saved summary' });
    database.collection('transcription_dispatch').values.push({ _id: 'transcription', jobId, attemptId: 'old', until: new Date(0) });
    assert.equal(await processTranscriptionJobs(10, db), 0);
    assert.equal(state.calls.length, 0);
    assert.equal(database.collection('integration_jobs').values[0].state, 'needs_review');
    assert.equal(database.collection('transcription_batches').values[0].status, 'needs_review');
    await resetBatchJobsForRetry('owner', 'review', [id], db);
    assert.equal(database.collection('integration_jobs').values[0].state, 'pending');
    assert.equal(database.collection('integration_jobs').values[0].attemptId, undefined);
    assert.equal((database.collection('integration_jobs').values[0].attemptHistory as Row[])[0].attemptId, 'old');
    assert.deepEqual((recordings[0] as Row).fullTranscript, ['Saved transcript']);
    assert.equal((recordings[0] as Row).summary, 'Saved summary');
    assert.equal(state.calls.length, 0);
});

test('already queued automatic and manual jobs for one recording make only one paid submission', async () => {
    const { state, database, db, recordings } = setup(1);
    const id = recordings[0]._id.toString();
    await enqueueTranscription('owner', id, {}, `auto:${id}`, true, db);
    await enqueueTranscription('owner', id, {}, `manual:${id}`, false, db);
    assert.equal(await processTranscriptionJobs(10, db), 1);
    assert.equal(state.calls.length, 1);
    assert.equal(database.collection('integration_jobs').values.filter(job => job.state === 'completed').length, 2);
});

test('a persisted explicit retranscription approval can process an already completed recording', async () => {
    const { state, database, db, recordings } = setup(1);
    const id = recordings[0]._id.toString();
    recordings[0].transcriptionStatus = 'completed';
    await enqueueTranscription('owner', id, {}, `manual:${id}`, false, db, undefined, true);
    assert.equal(database.collection('integration_jobs').values[0].retranscribe, true);
    assert.equal(await processTranscriptionJobs(10, db), 1);
    assert.equal(state.calls.length, 1);
});

test('accepted legacy async work blocks new submissions until its recording becomes terminal', async () => {
    const { state, database, db, recordings } = setup(2);
    const [legacy, next] = recordings;
    await enqueueTranscription('owner', legacy._id.toString(), {}, `legacy:${legacy._id}`, false, db);
    const legacyJob = database.collection('integration_jobs').values[0];
    Object.assign(legacyJob, { state: 'submitted', leaseUntil: new Date(0) });
    Object.assign(legacy, { transcriptionStatus: 'processing', externalTranscriptionId: 'legacy-provider', updatedAt: new Date(0) });
    await enqueueTranscription('owner', next._id.toString(), {}, `manual:${next._id}`, false, db);
    assert.equal(await processTranscriptionJobs(10, db), 0);
    assert.equal(state.calls.length, 0);
    legacy.transcriptionStatus = 'completed';
    assert.equal(await processTranscriptionJobs(10, db), 1);
    assert.equal(legacyJob.state, 'completed');
    assert.deepEqual(state.calls.map(call => call.recordingId), [next._id.toString()]);
});

test('expired legacy execution with an unknown outcome stops for review without resubmission', async () => {
    const { state, database, db, recordings } = setup(1);
    const id = recordings[0]._id.toString();
    await enqueueTranscription('owner', id, {}, `legacy:${id}`, false, db);
    Object.assign(database.collection('integration_jobs').values[0], { state: 'running', leaseUntil: new Date(0) });
    Object.assign(recordings[0], { transcriptionStatus: 'processing', updatedAt: new Date(0) });
    assert.equal(await processTranscriptionJobs(10, db), 0);
    assert.equal(database.collection('integration_jobs').values[0].state, 'needs_review');
    assert.equal(recordings[0].transcriptionStatus, 'failed');
    assert.equal(await processTranscriptionJobs(10, db), 0);
    assert.equal(state.calls.length, 0);
});

test('a delayed matching callback renews its expired slot before enrichment and excludes the next worker', async () => {
    const { state, database, db, recordings } = setup(2);
    state.complete = false;
    for (const recording of recordings) await enqueueTranscription('owner', recording._id.toString(), {}, `manual:${recording._id}`, false, db);
    assert.equal(await processTranscriptionJobs(10, db), 1);
    const current = state.calls[0];
    const slot = database.collection('transcription_dispatch').values[0];
    slot.until = new Date(0);
    const stop = await beginQueuedWebhookExecution('owner', current.recordingId, 'callback-current', current.execution, db);
    assert.ok(stop);
    try {
        (recordings[0] as Row).transcriptionEnrichmentPending = true;
        assert.ok((slot.until as Date).getTime() > Date.now());
        assert.equal(database.collection('integration_jobs').values[0].state, 'running');
        assert.equal(await processTranscriptionJobs(10, db), 0);
        assert.equal(state.calls.length, 1);
    } finally { stop(); }
});

test('a stale callback cannot renew or release a different execution attempt', async () => {
    const { state, database, db, recordings } = setup(2);
    state.complete = false;
    for (const recording of recordings) await enqueueTranscription('owner', recording._id.toString(), {}, `manual:${recording._id}`, false, db);
    assert.equal(await processTranscriptionJobs(10, db), 1);
    const old = state.calls[0];
    recordings[0].transcriptionStatus = 'completed';
    await settleQueuedTranscription('owner', old.recordingId, old.execution, db);
    assert.equal(await processTranscriptionJobs(10, db), 1);
    const current = state.calls[1];
    const slot = database.collection('transcription_dispatch').values[0];
    const until = (slot.until as Date).getTime();
    await assert.rejects(beginQueuedWebhookExecution('owner', old.recordingId, 'callback-stale', old.execution, db), /no longer owns/);
    assert.equal(slot.jobId, current.execution.jobId);
    assert.equal(slot.attemptId, current.execution.attemptId);
    assert.equal((slot.until as Date).getTime(), until);
    await settleQueuedTranscription('owner', old.recordingId, old.execution, db);
    assert.equal(slot.jobId, current.execution.jobId);
});


test('late saved completion requeues only enrichment while another account keeps its global slot', async () => {
    const { state, database, db, recordings } = setup(1);
    const id = recordings[0]._id.toString(), execution = { jobId: `manual:${id}`, attemptId: 'original-paid-attempt' };
    await enqueueTranscription('owner', id, {}, execution.jobId, false, db);
    Object.assign(database.collection('integration_jobs').values[0], { state: 'needs_review', attemptId: execution.attemptId, error: 'No callback within 24 hours' });
    Object.assign(recordings[0], { transcriptionStatus: 'pending', transcriptionJobId: execution.jobId, transcriptionAttemptId: execution.attemptId,
        transcriptionResultAttemptId: execution.attemptId, transcriptionEnrichmentPending: true, fullTranscript: ['Saved original source'], transcriptionCompletionPending: execution });
    database.collection('transcription_dispatch').values.push({ _id: 'transcription', jobId: 'other-job', attemptId: 'other-attempt', until: new Date(Date.now() + 600_000) });
    await queueDeferredTranscriptionCompletion('owner', id, execution, db);
    assert.equal(database.collection('integration_jobs').values[0].state, 'pending');
    assert.equal(database.collection('transcription_dispatch').values[0].jobId, 'other-job');
    assert.equal((recordings[0] as Row).transcriptionCompletionPending, undefined);
    assert.equal(state.calls.length, 0);
    assert.equal(await processTranscriptionJobs(1, db), 0, 'Queued enrichment must wait for the existing slot');
    assert.equal(state.calls.length, 0);
});

test('cron repairs a crash between late transcript persistence and queue handoff without losing the old outcome', async () => {
    const { state, database, db, recordings } = setup(1);
    const id = recordings[0]._id.toString(), execution = { jobId: `manual:${id}`, attemptId: 'original-paid-attempt' };
    await enqueueTranscription('owner', id, {}, execution.jobId, false, db);
    Object.assign(database.collection('integration_jobs').values[0], { state: 'needs_review', attemptId: execution.attemptId, error: 'Original timeout' });
    Object.assign(recordings[0], { transcriptionStatus: 'pending', transcriptionJobId: execution.jobId, transcriptionAttemptId: execution.attemptId,
        transcriptionResultAttemptId: execution.attemptId, transcriptionEnrichmentPending: true, fullTranscript: ['Saved original source'], transcriptionCompletionPending: execution });
    await processTranscriptionJobs(1, db);
    assert.equal(state.calls.length, 1);assert.deepEqual((recordings[0] as Row).fullTranscript, ['Saved original source']);
    assert.equal((recordings[0] as Row).transcriptionCompletionPending, undefined);
    const history = database.collection('integration_jobs').values[0].attemptHistory as Row[];
    assert.equal(history[0].attemptId, execution.attemptId);assert.equal(history[0].error, 'Original timeout');
});

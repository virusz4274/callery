import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { MongoServerError, ObjectId, type Db } from 'mongodb';
import type { TranscriptionExecution } from '@/lib/transcription/manual';
import { LEGACY_AI_BUDGET_REJECTION, ProcessingError } from '@/lib/transcription/processing-errors';
import type { Recording } from '@/lib/db/types';
import { recordingNeedsRefresh } from '@/lib/recording-refresh';

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
    for (const [field, value] of Object.entries({ ...update.$set as Row || {}, ...(inserting ? update.$setOnInsert as Row || {} : {}) })) {
        const parts = field.split('.');
        let target = row;
        for (const part of parts.slice(0, -1)) {
            if (!target[part] || typeof target[part] !== 'object') target[part] = {};
            target = target[part] as Row;
        }
        target[parts.at(-1)!] = copy(value);
    }
    for (const field of Object.keys(update.$unset as Row || {})) {
        const parts = field.split('.');
        const target = parts.slice(0, -1).reduce<Row | undefined>((value, part) => value?.[part] as Row | undefined, row);
        if (target) delete target[parts.at(-1)!];
    }
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
    searchCalls: { owner: string; recordingId: string; execution: TranscriptionExecution; profileId: string; revision: string }[];
    onSearchRun?: () => Promise<void | 'continue'>;
    searchRecoverySafe?: boolean;
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
        if (context.parentURL?.endsWith('/integrations/jobs.ts') && specifier === '@/lib/search/reindex') return {
            url: `data:text/javascript,${encodeURIComponent(`export async function runSearchIndexJob(owner, recordingId, execution, profileId, revision) {
                const state = globalThis[Symbol.for('vosift.test.queue-unit')];
                state.searchCalls.push({ owner, recordingId, execution, profileId, revision });
                return await state.onSearchRun?.();
            }
            export async function isSearchIndexRetrySafe() {
                return globalThis[Symbol.for('vosift.test.queue-unit')].searchRecoverySafe ?? true;
            }`)}`, shortCircuit: true,
        };
        return nextResolve(specifier, context);
    },
});
const { batchJobId, beginQueuedWebhookExecution, enqueueSearchIndex, enqueueTranscription, processTranscriptionJobs, queueDeferredTranscriptionCompletion, requestTranscription, resetBatchJobsForRetry, settleQueuedTranscription } = await import('./jobs');
after(() => hook.deregister());

function setup(count: number) {
    const database = new MemoryDatabase();
    const state: RunnerState = { database, calls: [], searchCalls: [], complete: true };
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

test('accepted pending work is visible on its recording without changing provider outcome evidence', async () => {
    const { state, database, db, recordings } = setup(2);
    const id = recordings[0]._id.toString();
    const prior = { stage: 'transcription', state: 'failed', providerOutcome: 'responded' };
    Object.assign(recordings[0], { processingStatus: prior });
    await enqueueTranscription('owner', id, {}, `manual:${id}`, false, db);
    assert.equal((recordings[0] as Row).transcriptionQueuedJobId, `manual:${id}`);
    assert.deepEqual((recordings[0] as Row).processingStatus, prior);
    assert.equal((recordings[1] as Row).transcriptionQueuedJobId, undefined, 'An unrequested recording must not look queued');
    assert.equal(state.calls.length, 0);
    delete (recordings[0] as Row).transcriptionQueuedJobId;
    await requestTranscription('owner', recordings[0] as Recording, {});
    assert.equal((recordings[0] as Row).transcriptionQueuedJobId, `manual:${id}`, 'Reusing a pending request repairs its presentation marker');
    await processTranscriptionJobs(1, db);
    assert.equal((recordings[0] as Row).transcriptionQueuedJobId, undefined);
    assert.equal(database.collection('integration_jobs').values[0].state, 'completed');
    await enqueueTranscription('owner', id, {}, `manual:${id}`, false, db);
    assert.equal((recordings[0] as Row).transcriptionQueuedJobId, undefined, 'A completed journal cannot recreate a queued marker');
});

test('a policy rejection before provider execution clears the marker and publishes a terminal failure', async () => {
    const { state, database, db, recordings } = setup(1);
    const id = recordings[0]._id.toString();
    await enqueueTranscription('owner', id, {}, `auto:${id}`, true, db);
    Object.assign(database.collection('users').values[0], { transcriptionSettings: { autoTranscribe: false } });
    await processTranscriptionJobs(1, db);
    assert.equal(state.calls.length, 0);
    assert.equal((recordings[0] as Row).transcriptionQueuedJobId, undefined);
    assert.equal(recordings[0].transcriptionStatus, 'failed');
    assert.equal(((recordings[0] as Row).processingStatus as Row).providerOutcome, 'not_started');
});

test('cron repairs a marker left behind by terminal queue settlement', async () => {
    const { state, database, db, recordings } = setup(1);
    const id = recordings[0]._id.toString();
    await enqueueTranscription('owner', id, {}, `manual:${id}`, false, db);
    const status = { stage: 'transcription', state: 'blocked', code: 'provider_configuration', providerOutcome: 'not_started' };
    Object.assign(database.collection('integration_jobs').values[0], { state: 'failed', processingStatus: status, error: 'Provider configuration changed.' });
    await processTranscriptionJobs(1, db);
    assert.equal(state.calls.length, 0);
    assert.equal((recordings[0] as Row).transcriptionQueuedJobId, undefined);
    assert.deepEqual((recordings[0] as Row).processingStatus, status);
    assert.equal(recordings[0].transcriptionStatus, 'failed');
});

test('a dispatcher crash before recording claim stops queued presentation for explicit outcome review', async () => {
    const { state, database, db, recordings } = setup(1);
    const id = recordings[0]._id.toString(), jobId = `manual:${id}`;
    await enqueueTranscription('owner', id, {}, jobId, false, db);
    Object.assign(database.collection('integration_jobs').values[0], { state: 'running', attemptId: 'interrupted-before-claim', leaseUntil: new Date(0) });
    database.collection('transcription_dispatch').values.push({ _id: 'transcription', jobId, attemptId: 'interrupted-before-claim', until: new Date(0) });
    await processTranscriptionJobs(1, db);
    assert.equal(state.calls.length, 0);
    assert.equal((recordings[0] as Row).transcriptionQueuedJobId, undefined);
    assert.equal(recordings[0].transcriptionStatus, 'failed');
    assert.equal(((recordings[0] as Row).processingStatus as Row).state, 'needs_review');
});

test('a submitted callback timeout publishes terminal recording status after its queue marker was cleared', async () => {
    const { state, database, db, recordings } = setup(1);
    const recording = recordings[0] as Recording;
    state.complete = false;
    state.onRun = async () => { Object.assign(recording, {
        processingStatus: { stage: 'transcription', state: 'running', providerOutcome: 'not_started' }, updatedAt: new Date(0),
    }); };
    await enqueueTranscription('owner', recording._id.toString(), {}, `manual:${recording._id}`, false, db);
    await processTranscriptionJobs(1, db);
    assert.equal(recording.transcriptionQueuedJobId, undefined);
    assert.equal(recordingNeedsRefresh(recording), true);
    const job = database.collection('integration_jobs').values[0];
    assert.equal(job.state, 'submitted');
    job.submittedAt = new Date(Date.now() - 25 * 60 * 60_000);
    database.collection('transcription_dispatch').values[0].until = new Date(0);

    await processTranscriptionJobs(0, db);

    assert.equal(job.state, 'needs_review');
    assert.equal(recording.transcriptionStatus, 'failed');
    assert.equal(recording.processingStatus?.state, 'needs_review');
    assert.equal(recording.processingStatus?.retryAction, 'review_provider');
    assert.equal(recording.processingStatus?.providerOutcome, 'unknown');
    assert.ok(recording.updatedAt.getTime() > 0);
    assert.equal(recordingNeedsRefresh(recording), false);
    assert.equal(state.calls.length, 1, 'Recovery must not repeat the provider call');
    await requestTranscription('owner', recording, { acknowledgeProviderOutcome: true });
    assert.equal(job.state, 'pending', 'Explicit provider-outcome review permits retry');
});

function previousTimeout(database: MemoryDatabase, recording: Row) {
    const id = (recording._id as ObjectId).toString(), jobId = `manual:${id}`;
    Object.assign(recording, { transcriptionStatus: 'failed', transcriptionJobId: jobId, transcriptionAttemptId: 'timed-out-attempt',
        processingStatus: { stage: 'transcription', state: 'running' }, transcriptionError: 'Original timeout explanation',
        fullTranscript: [{ speakerId: 'A', text: 'Retained source', words: [] }], summary: 'Retained summary', updatedAt: new Date(0) });
    const job: Row = { _id: jobId, owner: 'owner', recordingId: id, automatic: false, options: {}, state: 'needs_review',
        attemptId: 'timed-out-attempt', createdAt: new Date(0), leaseUntil: new Date(0),
        processingStatus: { stage: 'transcription', state: 'needs_review', code: 'provider_outcome_unknown', retryAction: 'review_provider', providerOutcome: 'unknown' } };
    database.collection('integration_jobs').values.push(job);
    return job;
}

test('cron repairs an existing failed recording left running after its terminal journal released the slot', async () => {
    const { state, database, db, recordings } = setup(1);
    const recording = recordings[0] as Recording;
    const job = previousTimeout(database, recording as unknown as Row);
    const snapshot = copy(recording);
    assert.equal(recording.transcriptionQueuedJobId, undefined);
    assert.equal(database.collection('transcription_dispatch').values.length, 0);
    assert.equal(recordingNeedsRefresh(recording), true);

    await processTranscriptionJobs(0, db);

    assert.deepEqual(recording.processingStatus, job.processingStatus);
    assert.ok(recording.updatedAt.getTime() > 0);
    Object.assign(snapshot, { processingStatus: job.processingStatus, updatedAt: recording.updatedAt });
    assert.deepEqual(recording, snapshot, 'Repair preserves the original transcript, summary, error and failed ASR status');
    assert.equal(recordingNeedsRefresh(recording), false);
    assert.equal(state.calls.length, 0);
    await requestTranscription('owner', recording, { acknowledgeProviderOutcome: true });
    assert.equal(job.state, 'pending');
});

for (const mismatch of ['attempt', 'owner', 'recording', 'search_job', 'nonterminal_status', 'pending_request'] as const) test(`terminal presentation repair ignores ${mismatch} evidence`, async () => {
    const { state, database, db, recordings } = setup(1);
    const source = recordings[0] as Row;
    const job = previousTimeout(database, source);
    if (mismatch === 'attempt') job.attemptId = 'other-attempt';
    if (mismatch === 'owner') job.owner = 'other-owner';
    if (mismatch === 'recording') job.recordingId = new ObjectId().toString();
    if (mismatch === 'search_job') job.kind = 'search_index';
    if (mismatch === 'nonterminal_status') job.processingStatus = { stage: 'transcription', state: 'running' };
    if (mismatch === 'pending_request') {
        job.state = 'pending';
        source.transcriptionQueuedJobId = job._id;
    }
    const snapshot = copy(source);

    await processTranscriptionJobs(0, db);

    assert.deepEqual(source, snapshot);
    assert.equal(state.calls.length, 0);
});

for (const race of ['new_attempt', 'new_queue_marker', 'completed_result', 'newer_revision'] as const) test(`terminal presentation repair preserves a concurrent ${race}`, async () => {
    const { state, database, db, recordings } = setup(1);
    const source = recordings[0] as Row;
    previousTimeout(database, source);
    const rows = database.collection('recordings');
    const update = rows.updateOne.bind(rows);
    let snapshot: Row | undefined;
    rows.updateOne = async (filter, patch, options) => {
        if (filter['processingStatus.state'] === 'running' && !snapshot) {
            if (race === 'new_attempt') source.transcriptionAttemptId = 'new-attempt';
            if (race === 'new_queue_marker') source.transcriptionQueuedJobId = 'new-queued-job';
            if (race === 'completed_result') {
                source.transcriptionStatus = 'completed';
                source.processingStatus = { stage: 'completed', state: 'completed' };
            }
            if (race === 'newer_revision') source.updatedAt = new Date();
            snapshot = copy(source);
        }
        return update(filter, patch, options);
    };

    await processTranscriptionJobs(0, db);

    assert.ok(snapshot);
    assert.deepEqual(source, snapshot);
    assert.equal(state.calls.length, 0);
});

test('terminal presentation repair drains at most 100 existing stuck records per invocation', async () => {
    const { state, database, db, recordings } = setup(101);
    for (const recording of recordings) previousTimeout(database, recording);

    await processTranscriptionJobs(0, db);

    assert.equal(recordings.filter(recording => ((recording as Row).processingStatus as Row).state === 'needs_review').length, 100);
    await processTranscriptionJobs(0, db);
    assert.equal(recordings.filter(recording => ((recording as Row).processingStatus as Row).state === 'needs_review').length, 101);
    assert.equal(state.calls.length, 0);
});

test('interrupted claimed enrichment publishes terminal status without losing the saved result', async () => {
    const { state, database, db, recordings } = setup(1);
    const recording = recordings[0] as Recording;
    const jobId = `manual:${recording._id}`;
    await enqueueTranscription('owner', recording._id.toString(), {}, jobId, false, db);
    Object.assign(database.collection('integration_jobs').values[0], { state: 'running', attemptId: 'interrupted', leaseUntil: new Date(0) });
    Object.assign(recording, { transcriptionStatus: 'processing', transcriptionJobId: jobId, transcriptionAttemptId: 'interrupted',
        transcriptionEnrichmentPending: true, fullTranscript: ['Saved transcript'], summary: 'Saved summary',
        processingStatus: { stage: 'summary', state: 'running' }, updatedAt: new Date(0) });
    delete recording.transcriptionQueuedJobId;
    database.collection('transcription_dispatch').values.push({ _id: 'transcription', jobId, attemptId: 'interrupted', until: new Date(0) });

    await processTranscriptionJobs(0, db);

    assert.equal(recording.processingStatus?.stage, 'summary');
    assert.equal(recording.processingStatus?.state, 'needs_review');
    assert.equal(recording.transcriptionStatus, 'failed');
    assert.ok(recording.updatedAt.getTime() > 0);
    assert.equal(recordingNeedsRefresh(recording), false);
    assert.deepEqual(recording.fullTranscript, ['Saved transcript']);
    assert.equal(recording.summary, 'Saved summary');
    assert.equal(state.calls.length, 0);
});

test('a stale slot cannot fail a newer recording attempt', async () => {
    const { database, db, recordings } = setup(1);
    const recording = recordings[0] as Recording;
    const oldJobId = `old:${recording._id}`;
    await enqueueTranscription('owner', recording._id.toString(), {}, oldJobId, false, db);
    Object.assign(database.collection('integration_jobs').values[0], { state: 'running', attemptId: 'old-attempt', leaseUntil: new Date(0) });
    Object.assign(recording, { transcriptionStatus: 'processing', transcriptionJobId: 'new-job', transcriptionAttemptId: 'new-attempt',
        processingStatus: { stage: 'transcription', state: 'running' }, updatedAt: new Date(1234) });
    recording.transcriptionQueuedJobId = oldJobId;
    const snapshot = copy(recording);
    database.collection('transcription_dispatch').values.push({ _id: 'transcription', jobId: oldJobId, attemptId: 'old-attempt', until: new Date(0) });

    await processTranscriptionJobs(0, db);

    delete snapshot.transcriptionQueuedJobId;
    assert.deepEqual(recording, snapshot, 'Only the abandoned old presentation marker may be removed');
    assert.equal(database.collection('integration_jobs').values[0].state, 'needs_review');
});

for (const race of ['renewed', 'new_attempt', 'completed'] as const) test(`timeout recovery preserves a concurrently ${race} execution`, async () => {
    const { state, database, db, recordings } = setup(1);
    const recording = recordings[0] as Recording;
    const jobId = `manual:${recording._id}`;
    await enqueueTranscription('owner', recording._id.toString(), {}, jobId, false, db);
    const jobs = database.collection('integration_jobs');
    const job = jobs.values[0];
    Object.assign(job, { state: 'running', attemptId: 'initial-attempt', leaseUntil: new Date(0) });
    Object.assign(recording, { transcriptionStatus: 'processing', transcriptionJobId: jobId, transcriptionAttemptId: 'initial-attempt',
        processingStatus: { stage: 'transcription', state: 'running' }, updatedAt: new Date(0) });
    delete recording.transcriptionQueuedJobId;
    const slot = { _id: 'transcription', jobId, attemptId: 'initial-attempt', until: new Date(0) };
    database.collection('transcription_dispatch').values.push(slot);
    const originalUpdate = jobs.updateOne.bind(jobs);
    let snapshot: Recording | undefined;
    jobs.updateOne = async (filter, update, options) => {
        if ((update.$set as Row)?.state === 'needs_review' && !snapshot) {
            if (race === 'completed') {
                Object.assign(job, { state: 'completed' });
                Object.assign(recording, { transcriptionStatus: 'completed', processingStatus: { stage: 'completed', state: 'completed' },
                    fullTranscript: ['Newly completed result'], updatedAt: new Date() });
            } else {
                Object.assign(job, { leaseUntil: new Date(Date.now() + 600_000) });
                slot.until = new Date(Date.now() + 600_000);
                if (race === 'new_attempt') {
                    job.attemptId = 'new-attempt';
                    slot.attemptId = 'new-attempt';
                    recording.transcriptionAttemptId = 'new-attempt';
                }
            }
            snapshot = copy(recording);
        }
        return originalUpdate(filter, update, options);
    };

    await processTranscriptionJobs(0, db);

    assert.ok(snapshot);
    assert.deepEqual(recording, snapshot);
    assert.equal(job.state, race === 'completed' ? 'completed' : 'running');
    assert.equal(state.calls.length, 0);
    if (race !== 'completed') assert.equal(slot.jobId, jobId, 'A stale recovery cannot release the renewed slot');
});

function savedTranscript(recording: Row) {
    Object.assign(recording, { transcriptionStatus: 'completed', fullTranscript: [{ speakerId: 'A', text: 'Saved source text', words: [] }],
        summary: 'Original summary', processingStatus: { stage: 'completed', state: 'completed' },
        transcriptionAttemptId: 'original-asr-attempt', transcriptionJobId: 'original-asr-job' });
}

test('search-only jobs are idempotent for a transcript revision and do not change transcription presentation', async () => {
    const { state, database, db, recordings } = setup(1);
    const recording = recordings[0] as Recording;
    savedTranscript(recording as unknown as Row);
    const snapshot = copy(recording);
    const [first, duplicate] = await Promise.all([
        enqueueSearchIndex('owner', recording._id.toString(), 'profile', db),
        enqueueSearchIndex('owner', recording._id.toString(), 'profile', db),
    ]);
    assert.equal(first.jobId, duplicate.jobId);
    assert.equal(database.collection('integration_jobs').values.length, 1);
    assert.deepEqual(recording, snapshot);

    assert.equal(await processTranscriptionJobs(1, db), 1);

    const job = database.collection('integration_jobs').values[0];
    assert.equal(job.kind, 'search_index');
    assert.equal(job.state, 'completed');
    assert.equal(state.calls.length, 0, 'Search indexing must never submit audio or generate a summary');
    assert.deepEqual(recording, snapshot);
    assert.equal(state.searchCalls.length, 1);
    assert.equal(state.searchCalls[0].profileId, 'profile');
    assert.equal(state.searchCalls[0].revision, job.searchTranscriptRevision);
    assert.equal(state.searchCalls[0].execution.jobId, job._id);
    // The runner boundary double records execution; publish its successful live
    // index explicitly before checking completed-request idempotency.
    recording.searchIndex = { state: 'ready', profileId: 'profile', transcriptRevision: String(job.searchTranscriptRevision),
        generation: 'published', totalPassages: 1, completedPassages: 1 };
    assert.equal((await enqueueSearchIndex('owner', recording._id.toString(), 'profile', db)).state, 'completed');
    assert.equal(await processTranscriptionJobs(1, db), 0);

    recording.fullTranscript![0].text = 'Corrected source text';
    const changed = await enqueueSearchIndex('owner', recording._id.toString(), 'profile', db);
    assert.notEqual(changed.jobId, first.jobId, 'Changed source text must receive fresh indexing work');
    const nextProfile = await enqueueSearchIndex('owner', recording._id.toString(), 'new-profile', db);
    assert.notEqual(nextProfile.jobId, changed.jobId, 'Embedding profiles have separate identities');
});

for (const liveIndex of ['other_profile', 'failed', 'other_revision', 'missing'] as const) test(`a completed indexing journal can rebuild its ${liveIndex} live index`, async () => {
    const { state, database, db, recordings } = setup(1);
    const recording = recordings[0] as Recording;
    savedTranscript(recording as unknown as Row);
    const first = await enqueueSearchIndex('owner', recording._id.toString(), 'profile-a', db);
    await processTranscriptionJobs(1, db);
    const job = database.collection('integration_jobs').values[0];
    if (liveIndex !== 'missing') recording.searchIndex = {
        state: liveIndex === 'failed' ? 'failed' : 'ready',
        profileId: liveIndex === 'other_profile' ? 'profile-b' : 'profile-a',
        transcriptRevision: liveIndex === 'other_revision' ? 'older-source' : String(job.searchTranscriptRevision),
        generation: 'current-generation', totalPassages: 1, completedPassages: 1,
    };
    const snapshot = copy(recording);

    const rebuild = await enqueueSearchIndex('owner', recording._id.toString(), 'profile-a', db);

    assert.equal(rebuild.state, 'queued');
    assert.equal(rebuild.jobId, first.jobId);
    assert.equal(job.state, 'pending');
    assert.equal((job.attemptHistory as Row[])[0].state, 'completed');
    assert.deepEqual(recording, snapshot, 'Explicit admission must not publish or alter an index itself');
    assert.equal(state.searchCalls.length, 1, 'Enqueue does not run another provider call');
});

test('search indexing and transcription share one execution slot while retaining separate journals', async () => {
    const { state, database, db, recordings } = setup(2);
    savedTranscript(recordings[0]);
    const search = await enqueueSearchIndex('owner', recordings[0]._id.toString(), 'profile', db);
    await enqueueTranscription('owner', recordings[1]._id.toString(), {}, `manual:${recordings[1]._id}`, false, db);
    let entered!: () => void;
    let finish!: () => void;
    const running = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { finish = resolve; });
    state.onSearchRun = async () => { entered(); await gate; };
    const worker = processTranscriptionJobs(1, db);
    await running;
    assert.equal(database.collection('transcription_dispatch').values[0].jobId, search.jobId);
    assert.equal(await processTranscriptionJobs(1, db), 0);
    assert.equal(state.calls.length, 0);
    finish();
    assert.equal(await worker, 1);
    assert.equal(await processTranscriptionJobs(1, db), 1);
    assert.equal(state.calls.length, 1);
    assert.equal(state.searchCalls.length, 1);
});

test('bounded search continuations retain saved work and resume with a fresh attempt in the shared slot', async () => {
    const { state, database, db, recordings } = setup(2);
    const source = recordings[0] as Row;
    savedTranscript(recordings[0]);
    const request = await enqueueSearchIndex('owner', recordings[0]._id.toString(), 'profile', db);
    const checkpoint = { id: 'same-funded-work', checkpoints: { 'passage-0': { state: 'completed', resultRef: 'saved-vector' } } };
    state.onSearchRun = async () => {
        source.searchIndexWork = copy(checkpoint);
        return 'continue';
    };

    assert.equal(await processTranscriptionJobs(1, db), 1);

    const job = database.collection('integration_jobs').values[0];
    const firstAttempt = state.searchCalls[0].execution.attemptId;
    assert.equal(job.state, 'pending');
    assert.equal(job.attemptId, undefined);
    assert.equal(job.leaseOwner, undefined);
    assert.equal((job.leaseUntil as Date).getTime(), 0);
    assert.equal(database.collection('transcription_dispatch').values[0].jobId, undefined);
    assert.deepEqual(source.searchIndexWork, checkpoint);
    assert.equal(recordings[0].transcriptionStatus, 'completed');
    assert.equal(state.calls.length, 0);
    await enqueueTranscription('owner', recordings[1]._id.toString(), {}, `manual:${recordings[1]._id}`, false, db);
    let entered!: () => void;
    let finish!: () => void;
    const running = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { finish = resolve; });
    state.onSearchRun = async () => {
        assert.deepEqual(source.searchIndexWork, checkpoint, 'Continuation must reuse committed passage progress');
        entered(); await gate;
    };
    const resumed = processTranscriptionJobs(1, db);
    await running;
    assert.equal(state.searchCalls[1].execution.jobId, request.jobId);
    assert.notEqual(state.searchCalls[1].execution.attemptId, firstAttempt);
    assert.equal(await processTranscriptionJobs(1, db), 0, 'Continuation excludes concurrent ASR work');
    assert.equal(state.calls.length, 0);
    finish();
    assert.equal(await resumed, 1);
    assert.equal(job.state, 'completed');
    assert.equal(await processTranscriptionJobs(1, db), 1);
    assert.equal(state.calls.length, 1);
});

test('a stale search continuation cannot reset or release a newer execution attempt', async () => {
    const { state, database, db, recordings } = setup(1);
    savedTranscript(recordings[0]);
    await enqueueSearchIndex('owner', recordings[0]._id.toString(), 'profile', db);
    state.onSearchRun = async () => {
        const job = database.collection('integration_jobs').values[0];
        job.attemptId = 'newer-owned-attempt';
        database.collection('transcription_dispatch').values[0].attemptId = 'newer-owned-attempt';
        return 'continue';
    };

    await processTranscriptionJobs(1, db);

    const job = database.collection('integration_jobs').values[0];
    assert.equal(job.state, 'running');
    assert.equal(job.attemptId, 'newer-owned-attempt');
    assert.equal(database.collection('transcription_dispatch').values[0].attemptId, 'newer-owned-attempt');
    assert.equal(state.calls.length, 0);
});

test('search continuation respects the dispatcher work limit instead of looping until the archive is indexed', async () => {
    const { state, database, db, recordings } = setup(1);
    savedTranscript(recordings[0]);
    await enqueueSearchIndex('owner', recordings[0]._id.toString(), 'profile', db);
    state.onSearchRun = async () => 'continue';

    assert.equal(await processTranscriptionJobs(3, db), 3);

    assert.equal(state.searchCalls.length, 3);
    assert.equal(new Set(state.searchCalls.map(call => call.execution.attemptId)).size, 3);
    assert.equal(database.collection('integration_jobs').values[0].state, 'pending');
    assert.equal(state.calls.length, 0);
});

test('an uncertain search-only attempt requires acknowledgement and never contaminates transcription retry', async () => {
    const { state, database, db, recordings } = setup(1);
    const recording = recordings[0] as Recording;
    savedTranscript(recording as unknown as Row);
    const snapshot = copy(recording);
    const request = await enqueueSearchIndex('owner', recording._id.toString(), 'profile', db);
    state.onSearchRun = async () => { throw new Error('Embedding response was lost'); };
    await processTranscriptionJobs(1, db);
    const job = database.collection('integration_jobs').values[0];
    assert.equal(job.state, 'needs_review');
    assert.equal((job.processingStatus as Row).stage, 'embedding');
    assert.deepEqual(recording, snapshot);
    assert.equal((await enqueueSearchIndex('owner', recording._id.toString(), 'profile', db)).state, 'needs_review');
    assert.equal(await processTranscriptionJobs(1, db), 0);
    assert.equal(state.searchCalls.length, 1, 'An uncertain outcome cannot automatically spend another embedding attempt');
    const retry = await enqueueSearchIndex('owner', recording._id.toString(), 'profile', db, true);
    assert.equal(retry.state, 'queued');
    assert.equal(retry.jobId, request.jobId);
    assert.equal((job.attemptHistory as Row[])[0].state, 'needs_review');
    await requestTranscription('owner', recording, { provider: 'gemini' }, true);
    assert.equal(database.collection('integration_jobs').values.length, 2, 'A pending search job must not impersonate an ASR request');
    state.onSearchRun = undefined;
    await processTranscriptionJobs(1, db);
    assert.equal(job.state, 'completed');
    assert.equal(state.calls.length, 0);
});

test('a known search-only failure can be explicitly retried without ASR or recording mutations', async () => {
    const { state, database, db, recordings } = setup(1);
    savedTranscript(recordings[0]);
    const snapshot = copy(recordings[0]);
    await enqueueSearchIndex('owner', recordings[0]._id.toString(), 'profile', db);
    state.onSearchRun = async () => { throw new ProcessingError('Embedding quota exhausted', {
        stage: 'embedding', state: 'failed', code: 'provider_quota', retryAction: 'resume_enrichment', providerOutcome: 'responded',
    }); };
    await processTranscriptionJobs(1, db);
    const job = database.collection('integration_jobs').values[0];
    assert.equal(job.state, 'failed');
    assert.equal((await enqueueSearchIndex('owner', recordings[0]._id.toString(), 'profile', db)).state, 'queued');
    state.onSearchRun = undefined;
    await processTranscriptionJobs(1, db);
    assert.equal(job.state, 'completed');
    assert.deepEqual(recordings[0], snapshot);
    assert.equal(state.calls.length, 0);
});

test('expired search-only work with no provider checkpoint permits explicit resume without touching ASR', async () => {
    const { state, database, db, recordings } = setup(1);
    savedTranscript(recordings[0]);
    const snapshot = copy(recordings[0]);
    const request = await enqueueSearchIndex('owner', recordings[0]._id.toString(), 'profile', db);
    const job = database.collection('integration_jobs').values[0];
    Object.assign(job, { state: 'running', attemptId: 'expired-search', leaseUntil: new Date(0) });
    database.collection('transcription_dispatch').values.push({ _id: 'transcription', jobId: request.jobId, attemptId: 'expired-search', until: new Date(0) });

    await processTranscriptionJobs(0, db);

    assert.equal(job.state, 'failed');
    assert.equal((job.processingStatus as Row).stage, 'embedding');
    assert.equal((job.processingStatus as Row).providerOutcome, 'not_started');
    assert.equal((job.processingStatus as Row).retryAction, 'resume_enrichment');
    assert.deepEqual(recordings[0], snapshot);
    assert.equal(database.collection('transcription_dispatch').values[0].jobId, undefined);
    assert.equal(state.calls.length, 0);
    assert.equal(state.searchCalls.length, 0);
});

for (const version of ['matching', 'new_profile', 'new_revision', 'new_generation'] as const) test(`expired search work updates only its ${version} index generation`, async () => {
    const { database, db, recordings } = setup(1);
    const recording = recordings[0] as Recording;
    savedTranscript(recording as unknown as Row);
    const request = await enqueueSearchIndex('owner', recording._id.toString(), 'profile', db);
    const job = database.collection('integration_jobs').values[0];
    const revision = String(job.searchTranscriptRevision);
    Object.assign(job, { state: 'running', attemptId: 'expired-search', leaseUntil: new Date(0) });
    Object.assign(recording, {
        searchIndex: { state: 'indexing', generation: version === 'new_generation' ? 'new-generation' : 'work', profileId: 'profile', transcriptRevision: revision },
        searchIndexWork: { id: 'work', profile: { id: version === 'new_profile' ? 'new-profile' : 'profile' }, transcriptRevision: revision },
        updatedAt: new Date(0),
    });
    if (version === 'new_revision') recording.fullTranscript![0].text = 'A newer source revision';
    const snapshot = copy(recording);
    database.collection('transcription_dispatch').values.push({ _id: 'transcription', jobId: request.jobId, attemptId: 'expired-search', until: new Date(0) });

    await processTranscriptionJobs(0, db);

    assert.equal(job.state, ['matching', 'new_generation'].includes(version) ? 'failed' : 'needs_review');
    if (version === 'matching') {
        assert.equal(recording.searchIndex?.state, 'failed');
        assert.ok(recording.updatedAt.getTime() > 0);
        Object.assign(snapshot.searchIndex!, { state: 'failed' });
        snapshot.updatedAt = recording.updatedAt;
    }
    assert.deepEqual(recording, snapshot, 'Search recovery may not change an unrelated generation or transcription result');
});

test('an expired search attempt with an unresolved provider response remains held for operator review', async () => {
    const { state, database, db, recordings } = setup(1);
    savedTranscript(recordings[0]);
    const request = await enqueueSearchIndex('owner', recordings[0]._id.toString(), 'profile', db);
    const job = database.collection('integration_jobs').values[0];
    state.searchRecoverySafe = false;
    Object.assign(recordings[0], { searchIndexWork: { id: 'work', profile: { id: 'profile' }, transcriptRevision: job.searchTranscriptRevision,
        checkpoints: { passage: { state: 'unknown' } } } });
    const snapshot = copy(recordings[0]);
    Object.assign(job, { state: 'running', attemptId: 'expired-search', leaseUntil: new Date(0) });
    database.collection('transcription_dispatch').values.push({ _id: 'transcription', jobId: request.jobId, attemptId: 'expired-search', until: new Date(0) });

    await processTranscriptionJobs(0, db);

    assert.equal(job.state, 'needs_review');
    assert.equal((job.processingStatus as Row).providerOutcome, 'unknown');
    assert.equal((job.processingStatus as Row).retryAction, 'contact_admin');
    assert.equal((await enqueueSearchIndex('owner', recordings[0]._id.toString(), 'profile', db)).state, 'needs_review');
    assert.deepEqual(recordings[0], snapshot);
    assert.equal(state.searchCalls.length, 0);
});

test('search enqueue requires an owned saved transcript', async () => {
    const { db, recordings } = setup(1);
    const id = recordings[0]._id.toString();
    await assert.rejects(enqueueSearchIndex('owner', id, 'profile', db), /saved transcript/i);
    savedTranscript(recordings[0]);
    await assert.rejects(enqueueSearchIndex('other-owner', id, 'profile', db), /saved transcript/i);
});

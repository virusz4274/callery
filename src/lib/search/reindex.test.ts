import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { ObjectId, type Db } from 'mongodb';
import type { Recording } from '@/lib/db/types';
import type { IAIService, AiStepContext } from '@/services/ai/types';
import type { ExecutionPolicySnapshot } from '@/lib/stripe/execution-policy';
import { MemoryBillingDatabase, clone, userFixture } from '@/lib/stripe/test-support';
import { ProcessingError } from '@/lib/transcription/processing-errors';
import { transcriptRevision } from '@/lib/transcription/ai-work-plan';
import type { EmbeddingProfile } from './types';

type Row = Record<string, unknown>;
type Update = { $set?: Row; $unset?: Row; $inc?: Row; $setOnInsert?: Row };
type Rows = ReturnType<MemoryBillingDatabase['collection']> & {
    bulkWrite(operations: { updateOne: { filter: Row; update: Update; upsert?: boolean } }[]): Promise<void>;
    updateMany(filter: Row, patch: Update): Promise<{ matchedCount: number }>;
    deleteMany(filter: Row): Promise<void>;
};
type Fixture = {
    memory: MemoryBillingDatabase; db: Db; profile: EmbeddingProfile; managed: boolean; paused: boolean;
    policies: Map<string, ExecutionPolicySnapshot>; calls: Map<string, string>; settlements: Map<string, string>;
    contexts: AiStepContext[]; service: IAIService; settlementFailures: number; saveFailure: boolean;
    onEmbedding?: (context?: AiStepContext) => Promise<void>; embeddingError?: Error;
};
const key = Symbol.for('vosift.test.search-reindex');
const world = globalThis as typeof globalThis & { [key]: Fixture };
const owner = 'owner', id = new ObjectId(), jobId = 'search-index-fixture', attemptId = 'index-attempt';
const execution = { jobId, attemptId };
const baseProfile: EmbeddingProfile = { id: 'search-profile', provider: 'gemini', model: 'test', dimensions: 2,
    adapterVersion: 1, chunkerVersion: 1, countBasis: 'utf8_byte_bound' };

const hook = registerHooks({ resolve(specifier, context, next) {
    const parent = context.parentURL;
    if (specifier === '@/lib/mongodb' && ['/search/reindex.ts', '/search/passages.ts', '/transcription/execution.ts'].some(path => parent?.endsWith(path))) return {
        url: `data:text/javascript,${encodeURIComponent("export const Collections={RECORDINGS:'recordings',USERS:'users'};export async function getMongoDb(){return globalThis[Symbol.for('vosift.test.search-reindex')].db;}")}`, shortCircuit: true,
    };
    if (parent?.endsWith('/search/reindex.ts')) {
        const prelude = "const s=()=>globalThis[Symbol.for('vosift.test.search-reindex')];";
        const code = specifier === '@/lib/config' ? 'export function billingEnabled(){return s().managed;}'
            : specifier === './profile' ? `export {validateEmbedding} from ${JSON.stringify(new URL('./profile.ts', import.meta.url).href)};export function embeddingProfile(){return structuredClone(s().profile);}`
            : specifier === '@/lib/processing-availability' ? "export async function assertProcessingAvailable(){if(s().paused)throw new Error('Processing paused');}"
            : specifier === '@/lib/stripe/ledger' ? "export async function ensurePaidBaseForNewWork(){}"
            : specifier === '@/lib/stripe/execution-policy' ? `export async function prepareExecutionPolicy(o,p){const old=s().policies.get(p.id);if(old&&JSON.stringify(old)!==JSON.stringify(p))throw new Error('Changed policy');s().policies.set(p.id,structuredClone(p));return p;}
                export async function acceptExecutionCall(o,p,id,hash){if(s().paused)throw new Error('Processing paused');const old=s().calls.get(id);if(old&&old!==hash)throw new Error('Changed call');s().calls.set(id,hash);}
                export async function recordExecutionOutcome(o,p,id,state){if(s().settlementFailures-->0)throw new Error('Completion journal unavailable');s().settlements.set(id,state);}
                export async function closeExecutionPolicy(o,p){if([...s().calls.keys()].some(id=>!s().settlements.has(id)))throw new Error('Unsettled call');}` : undefined;
        if (code) return { url: `data:text/javascript,${encodeURIComponent(prelude + code)}`, shortCircuit: true };
    }
    return next(specifier, context);
} });
const { isSearchIndexRetrySafe, runSearchIndexJob } = await import('./reindex');
hook.deregister();

async function fixture(text = 'The delivery arrives Friday afternoon.'): Promise<Fixture> {
    const memory = new MemoryBillingDatabase(), collection = memory.collection.bind(memory);
    memory.collection = (name: string) => {
        const rows = collection(name) as Rows;
        rows.bulkWrite = async operations => { for (const { updateOne } of operations) await rows.updateOne(updateOne.filter, updateOne.update, { upsert: updateOne.upsert }); };
        rows.updateMany = async (filter, patch) => {
            const selected = await rows.find(filter).toArray();
            for (const row of selected) await rows.updateOne({ _id: row._id }, patch);
            return { matchedCount: selected.length };
        };
        rows.deleteMany = async filter => {
            const selected = new Set((await rows.find(filter).toArray()).map(row => String(row._id)));
            rows.values = rows.values.filter(row => !selected.has(String(row._id)));
        };
        return rows;
    };
    const state: Fixture = { memory, db: memory.asDb(), profile: clone(baseProfile), managed: true, paused: false,
        policies: new Map(), calls: new Map(), settlements: new Map(), contexts: [], settlementFailures: 0, saveFailure: false,
        service: {
            generateSummary: async () => { throw new Error('Search indexing must not summarize'); },
            generateTransliteration: async () => { throw new Error('Search indexing must not transliterate'); },
            generateEmbedding: async (_text, context) => {
                assert.ok(context); state.contexts.push(context);
                await state.onEmbedding?.(context);
                if (state.embeddingError) throw state.embeddingError;
                await context.onUsage?.({ provider: 'gemini', model: 'test', step: 'embedding', measured: false });
                return [0.4, 0.6];
            },
        } };
    world[key] = state;
    const recording: Recording = { _id: id, authSubject: owner, contactId: new ObjectId(), contactName: 'Caller', phoneNumber: '55542', normalizedPhoneNumber: '55542',
        fileName: 'original.mp3', standardizedDisplayName: 'Original call', r2Key: 'private/original.mp3', fileSize: 1234, mimeType: 'audio/mpeg', duration: 60,
        recordedAt: new Date('2026-11-01'), createdAt: new Date('2026-11-01'), updatedAt: new Date('2026-11-01'),
        fullTranscript: [{ speakerId: 'A', text, words: [], start: 10, end: 25 }], summary: 'The original saved summary.', languageCode: 'en',
        transcriptionStatus: 'completed', transcriptionEnrichmentPending: false, transcriptionResultAttemptId: 'original-stt-attempt',
        transcriptionUsageReportId: 'original-usage', transcriptionReceipt: { id: 'original-receipt', readyAt: new Date('2026-11-01') } as Recording['transcriptionReceipt'],
        aiWorkCheckpoints: { 'original-summary': { request: { id: 'original-summary' }, state: 'completed' } } as unknown as Recording['aiWorkCheckpoints'],
        tags: [], isStarred: false, isArchived: false };
    await memory.collection('recordings').insertOne(recording as unknown as Row);
    await memory.collection('users').insertOne(userFixture({ authSubject: owner, planKey: 'internal', billingEntitlement: { source: 'admin', grantedAt: new Date() } }) as unknown as Row);
    await memory.collection('integration_jobs').insertOne({ _id: jobId, owner, recordingId: id.toString(), kind: 'search_index', state: 'running', attemptId });
    await memory.collection('transcription_dispatch').insertOne({ _id: 'transcription', jobId, attemptId });
    const rows = memory.collection('recordings'), update = rows.updateOne.bind(rows);
    rows.updateOne = async (filter, patch, options) => {
        const values = !Array.isArray(patch) ? patch.$set as Partial<Recording> | undefined : undefined;
        if (state.saveFailure && Object.values(values?.searchIndexWork?.checkpoints || {}).some(checkpoint => checkpoint.state === 'response_saved')) {
            state.saveFailure = false; throw new Error('Parent checkpoint write unavailable');
        }
        return update(filter, patch, options);
    };
    return state;
}
function recording(state: Fixture): Recording { return state.memory.collection('recordings').values[0] as unknown as Recording; }
async function run(state: Fixture, profileId = state.profile.id, revision = transcriptRevision(recording(state).fullTranscript!)) {
    return runSearchIndexJob(owner, id.toString(), execution, profileId, revision, { db: state.db, service: state.service });
}
function originalData(source: Recording) {
    const { updatedAt: _updatedAt, searchIndex: _searchIndex, searchIndexWork: _work, aiWorkRevision: _revision, ...original } = source;
    return clone(original);
}

test('indexes an existing transcript using embeddings only and preserves original audio, summaries and billing evidence', async () => {
    const state = await fixture(), original = originalData(recording(state)), user = clone(state.memory.user());
    await run(state);
    assert.deepEqual(originalData(recording(state)), original);
    assert.deepEqual(state.memory.user(), user);
    assert.equal(recording(state).searchIndex?.state, 'ready');
    assert.ok(state.contexts.length > 0);
    assert.ok(state.contexts.every(context => context.plannedRequest?.embedding?.purpose === 'document' && context.plannedRequest.model === 'test'));
    assert.equal(state.memory.collection('recording_passages').values.length, state.contexts.length);
    assert.ok(state.memory.collection('recording_passages').values.every(row => row.published === true));
    await run(state);
    assert.equal(state.contexts.length, 1, 'Already-current recordings require no second embedding');
});

test('cycling embedding profiles creates a fresh operation and replaces old passages without changing source data', async () => {
    const state = await fixture(), original = originalData(recording(state));
    await run(state);
    const firstGeneration = recording(state).searchIndexWork!.id;
    const firstPassageIds = state.memory.collection('recording_passages').values.map(row => row._id);

    state.profile = { ...clone(baseProfile), id: 'alternate-profile', model: 'alternate-model' };
    await run(state);
    const alternateGeneration = recording(state).searchIndexWork!.id;
    assert.notEqual(alternateGeneration, firstGeneration);
    assert.ok(state.memory.collection('recording_passages').values.every(row => row.generation === alternateGeneration && row.profileId === state.profile.id && row.published));

    state.profile = clone(baseProfile);
    await run(state);
    const returnedGeneration = recording(state).searchIndexWork!.id;
    assert.notEqual(returnedGeneration, firstGeneration, 'Returning to a previous model must not reuse its closed operation');
    assert.notEqual(returnedGeneration, alternateGeneration);
    const currentPassages = state.memory.collection('recording_passages').values;
    assert.equal(currentPassages.length, 1);
    assert.ok(currentPassages.every(row => row.generation === returnedGeneration && row.profileId === baseProfile.id && row.published));
    assert.ok(currentPassages.every(row => !firstPassageIds.includes(row._id)), 'Old passage receipts must not substitute for the new operation');
    assert.equal(state.policies.size, 3);
    assert.equal(state.contexts.length, 3);
    assert.deepEqual(state.contexts.map(context => context.plannedRequest?.model), ['test', 'alternate-model', 'test']);
    assert.ok(state.contexts.every(context => context.plannedRequest?.embedding?.purpose === 'document'));
    assert.deepEqual(originalData(recording(state)), original);
});

test('long transcripts yield after bounded provider work and resume without repeating paid passages', async () => {
    const state = await fixture('detail '.repeat(2000));
    recording(state).duration = 3600;
    const original = originalData(recording(state));
    let outcome = await run(state);
    assert.equal(outcome, 'continue');
    assert.equal(state.contexts.length, 20);
    const workId = recording(state).searchIndexWork!.id;
    assert.equal(recording(state).searchIndex?.state, 'indexing');
    assert.equal(recording(state).searchIndex?.completedPassages, 20);
    assert.ok(state.memory.collection('recording_passages').values.every(row => row.published === false));
    const firstReceipts = state.memory.collection('recording_passages').values
        .filter(row => row.response).map(row => [String(row._id), clone(row.response)] as const);
    let runs = 1;
    while (outcome === 'continue' && runs < 5) {
        const priorCalls = state.contexts.length;
        outcome = await run(state); runs++;
        assert.ok(state.contexts.length - priorCalls <= 20);
        assert.equal(recording(state).searchIndexWork!.id, workId);
    }
    assert.equal(outcome, undefined);
    assert.ok(runs <= 3);
    assert.equal(recording(state).searchIndex?.state, 'ready');
    const total = recording(state).searchIndex!.totalPassages;
    assert.equal(state.contexts.length, total);
    assert.equal(new Set(state.contexts.map(context => context.reservationId)).size, total);
    assert.equal(new Set(state.contexts.map(context => context.plannedRequest?.id)).size, total);
    const passages = state.memory.collection('recording_passages').values;
    assert.ok(passages.every(row => row.published === true));
    for (const [passageId, receipt] of firstReceipts) assert.deepEqual(passages.find(row => String(row._id) === passageId)?.response, receipt);
    assert.deepEqual(originalData(recording(state)), original);
});

test('the worker deadline yields between committed responses and a later run resumes the same operation', async t => {
    const state = await fixture('delivery detail '.repeat(60));
    let clock = Date.now();
    t.mock.method(Date, 'now', () => clock);
    state.onEmbedding = async () => { clock += 45_001; };
    assert.equal(await run(state), 'continue');
    assert.equal(state.contexts.length, 1);
    assert.equal(recording(state).searchIndex?.completedPassages, 1);
    const acceptedId = recording(state).searchIndexWork!.id;
    assert.equal(recording(state).searchIndexWork!.checkpoints['passage-0'].state, 'completed');
    state.onEmbedding = undefined;
    assert.equal(await run(state), undefined);
    assert.equal(recording(state).searchIndex?.state, 'ready');
    assert.equal(recording(state).searchIndexWork!.id, acceptedId);
    assert.equal(new Set(state.contexts.map(context => context.plannedRequest?.id)).size, state.contexts.length);
});

test('profile, transcript revision, ownership and queue slot are checked before provider work', async t => {
    for (const change of ['profile', 'revision', 'owner', 'slot', 'job', 'account', 'paused']) await t.test(change, async () => {
        const state = await fixture();
        if (change === 'owner') recording(state).authSubject = 'other-owner';
        if (change === 'slot') state.memory.collection('transcription_dispatch').values[0].attemptId = 'new-attempt';
        if (change === 'job') state.memory.collection('integration_jobs').values[0].state = 'completed';
        if (change === 'account') state.memory.user().disabled = true;
        if (change === 'paused') state.paused = true;
        await assert.rejects(run(state, change === 'profile' ? 'wrong-profile' : state.profile.id, change === 'revision' ? 'wrong-revision' : undefined));
        assert.equal(state.contexts.length, 0);
    });
});

test('saved passage responses recover parent-write and completion-journal crashes without another provider call', async t => {
    for (const failure of ['parent-write', 'completion-journal']) await t.test(failure, async () => {
        const state = await fixture();
        state.saveFailure = failure === 'parent-write'; state.settlementFailures = failure === 'completion-journal' ? 1 : 0;
        await assert.rejects(run(state), /response is saved/);
        assert.equal(state.contexts.length, 1);
        const acceptedId = recording(state).searchIndexWork!.id;
        assert.equal(await isSearchIndexRetrySafe(recording(state).searchIndexWork, owner, id.toString()), true);
        await run(state);
        assert.equal(recording(state).searchIndexWork!.id, acceptedId, 'Matching retries retain the same accepted operation');
        assert.equal(state.contexts.length, 1);
        assert.equal(recording(state).searchIndex?.state, 'ready');
    });
});

test('known provider rejection resumes only failed passages and stops after the single retry', async () => {
    const state = await fixture('Friday delivery details. '.repeat(30));
    let fail = true;
    state.onEmbedding = async context => {
        if (context?.plannedRequest?.id === 'passage-1' && fail) throw Object.assign(new Error('Provider quota'), { status: 429 });
    };
    await assert.rejects(run(state), /Retry to resume/);
    fail = false;
    await run(state);
    assert.equal(state.contexts.filter(context => context.plannedRequest?.id === 'passage-0').length, 1);
    assert.equal(state.contexts.filter(context => context.plannedRequest?.id === 'passage-1').length, 2);
    assert.equal(recording(state).searchIndex?.state, 'ready');

    const exhausted = await fixture(); exhausted.embeddingError = Object.assign(new Error('Provider quota'), { status: 429 });
    await assert.rejects(run(exhausted), /Retry to resume/);
    await assert.rejects(run(exhausted), /Retry to resume/);
    assert.equal(await isSearchIndexRetrySafe(recording(exhausted).searchIndexWork, owner, id.toString()), true,
        'A known rejection is safe to inspect again, but does not grant another provider attempt');
    await assert.rejects(run(exhausted), /normal indexing attempt and single retry/);
    assert.equal(exhausted.contexts.length, 2);
});

test('uncertain provider outcomes require review and cannot be replayed by another worker attempt', async () => {
    const state = await fixture(); state.embeddingError = new Error('Connection lost after submission');
    await assert.rejects(run(state), (error: unknown) => error instanceof ProcessingError && error.processingStatus.providerOutcome === 'unknown');
    state.embeddingError = undefined;
    assert.equal(await isSearchIndexRetrySafe(recording(state).searchIndexWork, owner, id.toString()), false);
    await assert.rejects(run(state), /Review the provider outcome/);
    assert.equal(state.contexts.length, 1);
    assert.equal(recording(state).searchIndexWork?.checkpoints['passage-0'].state, 'unknown');
});

test('retry safety accepts unstarted work and prepared checkpoints without inventing another attempt', async () => {
    const state = await fixture();
    assert.equal(await isSearchIndexRetrySafe(undefined, owner, id.toString()), true);
    state.embeddingError = Object.assign(new Error('Provider quota'), { status: 429 });
    await assert.rejects(run(state), /Retry to resume/);
    const work = clone(recording(state).searchIndexWork!);
    work.checkpoints = {};
    assert.equal(await isSearchIndexRetrySafe(work, owner, id.toString()), true);
    // Simulate interruption after preparing the immutable call but before submission.
    work.checkpoints = clone(recording(state).searchIndexWork!.checkpoints);
    work.checkpoints['passage-0'].state = 'prepared';
    assert.equal(await isSearchIndexRetrySafe(work, owner, id.toString()), true);
    assert.equal(work.checkpoints['passage-0'].attempts, 1);
    assert.equal(state.contexts.length, 1, 'The readiness check must not invoke any provider');
});

test('retry safety requires an owned, valid external vector when a submitted response is unresolved', async t => {
    for (const change of ['missing-vector', 'wrong-width', 'zero-vector', 'nonfinite-vector', 'missing-receipt', 'different-attempt', 'wrong-owner', 'wrong-recording']) {
        await t.test(change, async () => {
            const state = await fixture(); state.saveFailure = true;
            await assert.rejects(run(state), /response is saved/);
            const work = recording(state).searchIndexWork!;
            assert.equal(work.checkpoints['passage-0'].state, 'started', 'The response persisted before its parent checkpoint');
            assert.equal(await isSearchIndexRetrySafe(work, owner, id.toString()), true);
            const row = state.memory.collection('recording_passages').values[0];
            if (change === 'missing-vector') delete row.vector;
            if (change === 'wrong-width') row.vector = [0.5];
            if (change === 'zero-vector') row.vector = [0, 0];
            if (change === 'nonfinite-vector') row.vector = [NaN, 0.5];
            if (change === 'missing-receipt') delete row.response;
            if (change === 'different-attempt') (row.response as Row).attempts = 99;
            assert.equal(await isSearchIndexRetrySafe(work, change === 'wrong-owner' ? 'another-owner' : owner,
                change === 'wrong-recording' ? new ObjectId().toString() : id.toString()), false);
            assert.equal(state.contexts.length, 1);
        });
    }
});

test('recording deletion, newer transcripts and lost queue ownership fence late embedding responses', async t => {
    for (const change of ['delete', 'slot', 'transcript']) await t.test(change, async () => {
        const state = await fixture(), original = originalData(recording(state));
        state.onEmbedding = async () => {
            if (change === 'delete') {
                state.memory.collection('recordings').values = [];
                state.memory.collection('recording_passages').values = [];
            } else if (change === 'slot') state.memory.collection('transcription_dispatch').values[0].attemptId = 'new-attempt';
            else await state.memory.collection('recordings').updateOne({ _id: id }, {
                $set: { fullTranscript: [{ speakerId: 'B', text: 'The newer provider result.', words: [] }] }, $inc: { aiWorkRevision: 1 },
            });
        };
        await assert.rejects(run(state));
        assert.ok(state.memory.collection('recording_passages').values.every(row => row.published !== true));
        if (change === 'delete') {
            assert.equal(state.memory.collection('recordings').values.length, 0);
            assert.equal(state.memory.collection('recording_passages').values.length, 0);
        } else if (change === 'slot') assert.deepEqual(originalData(recording(state)), original);
        else assert.equal(recording(state).fullTranscript?.[0].text, 'The newer provider result.');
    });
});

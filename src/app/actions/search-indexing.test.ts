import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { ObjectId, type Db } from 'mongodb';
import type { Recording } from '@/lib/db/types';
import type { SearchIndexingScope } from '@/lib/search/types';

type Row = Record<string, unknown>;
function equal(left: unknown, right: unknown): boolean {
    if (left instanceof ObjectId || right instanceof ObjectId) return left instanceof ObjectId && right instanceof ObjectId && left.equals(right);
    return left === right;
}
function matches(row: Row, filter: Row): boolean {
    return Object.entries(filter).every(([field, expected]) => {
        if (field === '$or') return (expected as Row[]).some(branch => matches(row, branch));
        const actual = field.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Row)[part] : undefined, row);
        if (expected && typeof expected === 'object' && !(expected instanceof Date) && !(expected instanceof ObjectId)) {
            return Object.entries(expected as Row).every(([operator, operand]) => {
                if (operator === '$exists') return (actual !== undefined) === operand;
                if (operator === '$ne') return !equal(actual, operand);
                if (operator === '$in') return (operand as unknown[]).some(item => equal(actual, item));
                if (operator === '$nin') return !(operand as unknown[]).some(item => equal(actual, item));
                if (operator === '$gte') return actual !== undefined && Number(actual) >= Number(operand);
                if (operator === '$lte') return actual !== undefined && Number(actual) <= Number(operand);
                throw new Error(`Unsupported action-fixture operator ${operator}`);
            });
        }
        return equal(actual, expected);
    });
}
class Rows {
    values: Row[] = [];
    find(filter: Row) {
        let selected = this.values.filter(row => matches(row, filter));
        const cursor = {
            project: (_projection: Row) => cursor,
            sort: (sort: Record<string, number>) => {
                selected.sort((left, right) => {
                    for (const [field, direction] of Object.entries(sort)) {
                        const a = left[field], b = right[field];
                        const comparison = a instanceof Date && b instanceof Date ? a.getTime() - b.getTime()
                            : String(a).localeCompare(String(b));
                        if (comparison) return comparison * direction;
                    }
                    return 0;
                });
                return cursor;
            },
            limit: (limit: number) => { selected = selected.slice(0, limit); return cursor; },
            toArray: async () => selected,
        };
        return cursor;
    }
    async countDocuments(filter: Row) { return this.values.filter(row => matches(row, filter)).length; }
}
class Database {
    recordings = new Rows();
    jobs = new Rows();
    collection(name: string) {
        if (name === 'recordings') return this.recordings;
        if (name === 'integration_jobs') return this.jobs;
        throw new Error(`Unexpected action-fixture collection ${name}`);
    }
    asDb() { return this as unknown as Db; }
}
type QueueState = 'queued' | 'completed' | 'needs_review';
interface State {
    owner: string | null;
    db: Database;
    dbReads: number;
    readinessChecks: number;
    accessChecks: string[];
    accessError?: string;
    ready: boolean;
    profileError: boolean;
    queued: { owner: string; recordingId: string; profileId: string }[];
    outcomes: Map<string, QueueState>;
    after: (() => Promise<void>)[];
    wakes: number;
    enqueue: (owner: string, recordingId: string, profileId: string) => Promise<{ state: QueueState }>;
}
const key = Symbol.for('vosift.test.search-indexing-actions');
const shared = globalThis as typeof globalThis & { [key]: State };
const ref = `globalThis[Symbol.for('vosift.test.search-indexing-actions')]`;
const hook = registerHooks({ resolve(specifier, context, next) {
    let source: string | undefined;
    if (context.parentURL?.endsWith('/actions/search-indexing.ts')) {
        if (specifier === 'next/server') source = `export function after(work){${ref}.after.push(work);}`;
        if (specifier === '@/lib/auth-utils') source = `export async function getAuthSubjectFromSession(){return ${ref}.owner;}`;
        if (specifier === '@/lib/mongodb') source = `export const Collections={RECORDINGS:'recordings'}; export async function getMongoDb(){${ref}.dbReads++;return ${ref}.db.asDb();}`;
        if (specifier === '@/lib/integrations/database') source = `export async function integrationDb(){${ref}.dbReads++;return ${ref}.db.asDb();}`;
        if (specifier === '@/lib/integrations/jobs') source = `export async function enqueueSearchIndex(...args){return ${ref}.enqueue(...args);} export async function processTranscriptionJobs(){${ref}.wakes++;}`;
        if (specifier === '@/lib/search/reindex') source = `export async function assertSearchIndexingAccess(owner){${ref}.accessChecks.push(owner);if(${ref}.accessError)throw new Error(${ref}.accessError);}`;
        if (specifier === '@/lib/search/profile') source = `export function embeddingProfile(){if(${ref}.profileError)throw new Error('No embedding profile');return {id:'current-profile'};}`;
        if (specifier === '@/lib/search/readiness') source = `export async function inspectSearchReadiness(){${ref}.readinessChecks++;return {ready:${ref}.ready,message:${ref}.ready?'Ready':'Create the passage vector index first.'};}`;
        if (specifier === '@/lib/logger') source = 'export const logger={error(){}};';
    }
    return source ? { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true } : next(specifier, context);
} });
const { getSearchIndexingStatusAction: readStatus, startSearchIndexingAction: startIndexing } = await import('./search-indexing');
const getSearchIndexingStatusAction = (scope: SearchIndexingScope = {}) => readStatus(scope, 'owner');
const startSearchIndexingAction = (scope: SearchIndexingScope = {}) => startIndexing(scope, 'owner');
hook.deregister();

function setup() {
    const state: State = {
        owner: 'owner', db: new Database(), dbReads: 0, readinessChecks: 0, accessChecks: [], ready: true, profileError: false,
        queued: [], outcomes: new Map(), after: [], wakes: 0,
        enqueue: async (owner, recordingId, profileId) => {
            state.queued.push({ owner, recordingId, profileId });
            const outcome = state.outcomes.get(recordingId) ?? 'queued';
            state.db.jobs.values.push({ _id: `index:${recordingId}`, owner, recordingId, searchProfileId: profileId,
                kind: 'search_index', state: outcome === 'queued' ? 'pending' : outcome });
            return { state: outcome };
        },
    };
    shared[key] = state;
    return state;
}
function recording(overrides: Partial<Recording> = {}): Row {
    return { _id: new ObjectId(), authSubject: 'owner', contactId: new ObjectId('111111111111111111111111'),
        recordedAt: new Date('2026-11-04T12:00:00Z'), updatedAt: new Date(), transcriptionStatus: 'completed',
        fullTranscript: [{ speakerId: 'A', text: 'Saved complete transcript', words: [] }], summary: 'Keep the saved summary',
        transcriptionReceipt: { id: 'accepted-audio-receipt' }, ...overrides };
}

test('search indexing requires authentication before reading data or scheduling work', async () => {
    const state = setup(); state.owner = null;
    assert.equal((await getSearchIndexingStatusAction()).success, false);
    assert.equal((await startSearchIndexingAction()).success, false);
    assert.equal(state.dbReads, 0);
    assert.equal(state.queued.length, 0);
    assert.equal(state.after.length, 0);
});

test('account changes or missing confirmation identity cannot read another queue or approve provider work', async () => {
    for (const expectedOwner of ['previous-account', undefined]) {
        const state = setup(); state.db.recordings.values.push(recording());
        assert.equal((await readStatus({}, expectedOwner)).success, false);
        assert.equal((await startIndexing({}, expectedOwner)).success, false);
        assert.equal(state.dbReads, 0);
        assert.equal(state.queued.length, 0);
        assert.equal(state.after.length, 0);
    }
});

test('malformed or reversed contact/date scopes never enqueue saved transcripts', async () => {
    for (const scope of [{ owner: 'other' }, { contactId: 'bad-id' }, { startDate: 'not-a-date' },
        { startDate: '2026-11-07', endDate: '2026-11-01' }]) {
        const state = setup(); state.db.recordings.values.push(recording());
        assert.equal((await getSearchIndexingStatusAction(scope as SearchIndexingScope)).success, false);
        assert.equal((await startSearchIndexingAction(scope as SearchIndexingScope)).success, false);
        assert.equal(state.queued.length, 0);
        assert.equal(state.after.length, 0);
    }
});

test('processing access and vector readiness are checked before any indexing admission', async () => {
    for (const problem of ['access', 'index', 'profile'] as const) {
        const state = setup(); state.db.recordings.values.push(recording());
        if (problem === 'access') state.accessError = 'Account processing is blocked';
        if (problem === 'index') state.ready = false;
        if (problem === 'profile') state.profileError = true;
        const response = await startSearchIndexingAction();
        assert.equal(response.success, false);
        if (problem === 'index' && !response.success) assert.match(response.error, /passage vector index/);
        assert.equal(state.queued.length, 0);
        assert.equal(state.after.length, 0);
    }
});

test('contact/date scopes admit only owned complete unarchived transcripts needing the current index', async () => {
    const state = setup();
    const wanted = recording();
    const changedProfile = recording({ searchIndex: { profileId: 'old-profile', state: 'ready' } as Recording['searchIndex'] });
    state.db.recordings.values.push(wanted, changedProfile,
        recording({ authSubject: 'other-owner' }), recording({ contactId: new ObjectId('222222222222222222222222') }),
        recording({ recordedAt: new Date('2026-10-01') }), recording({ recordedAt: new Date('2026-11-07') }),
        recording({ isArchived: true }), recording({ fullTranscript: [] }), recording({ transcriptionStatus: 'failed' }),
        recording({ transcriptionEnrichmentPending: true }), recording({ transcriptionQueuedJobId: 'pending-asr' }),
        recording({ searchIndex: { profileId: 'current-profile', state: 'ready' } as Recording['searchIndex'] }));
    const scope = { contactId: '111111111111111111111111', startDate: '2026-11-01', endDate: '2026-11-05' };
    const status = await getSearchIndexingStatusAction(scope);
    assert.equal(status.success, true);
    if (status.success) { assert.equal(status.status.eligible, 2); assert.equal(status.status.available, 2); }
    const response = await startSearchIndexingAction(scope);
    assert.deepEqual(response, { success: true, queued: 2, needsReview: 0, alreadyReady: 0 });
    assert.deepEqual(new Set(state.queued.map(item => item.recordingId)), new Set([String(wanted._id), String(changedProfile._id)]));
    assert.equal(state.queued.every(item => item.owner === 'owner' && item.profileId === 'current-profile'), true);
});

test('existing completed transcripts queue embedding-only work and wake the shared worker after the response', async () => {
    const state = setup();
    const source = recording();
    state.db.recordings.values.push(source);
    const snapshot = structuredClone(source);
    const response = await startSearchIndexingAction();
    assert.deepEqual(response, { success: true, queued: 1, needsReview: 0, alreadyReady: 0 });
    assert.deepEqual(structuredClone(source), snapshot, 'Admission must preserve ASR status, summary and audio usage receipt');
    assert.deepEqual(state.accessChecks, ['owner']);
    assert.equal(state.wakes, 0);
    assert.equal(state.after.length, 1);
    await state.after[0]();
    assert.equal(state.wakes, 1);
});

test('bounded batches advance past existing pending jobs until a large archive has been admitted', async () => {
    const state = setup();
    state.db.recordings.values.push(...Array.from({ length: 205 }, () => recording()));
    for (const expected of [100, 100, 5, 0]) {
        const response = await startSearchIndexingAction();
        assert.equal(response.success, true);
        if (response.success) assert.equal(response.queued, expected);
    }
    assert.equal(state.queued.length, 205);
    assert.equal(new Set(state.queued.map(item => item.recordingId)).size, 205);
    assert.equal(state.after.length, 3, 'An empty final batch must not schedule a worker');
    const status = await getSearchIndexingStatusAction();
    assert.equal(status.success, true);
    if (status.success) {
        assert.equal(status.status.eligible, 205);
        assert.equal(status.status.available, 0);
        assert.equal(status.status.queued, 205);
        assert.equal(status.status.batchSize, 100);
    }
});

test('busy and operator-review recordings cannot starve later eligible work in the next batch', async () => {
    const state = setup();
    const sources = Array.from({ length: 125 }, () => recording());
    state.db.recordings.values.push(...sources);
    for (let index = 0; index < 110; index++) state.db.jobs.values.push({ _id: `old-${index}`, owner: 'owner', kind: 'search_index',
        recordingId: String(sources[index]._id), searchProfileId: 'current-profile',
        state: index < 100 ? 'pending' : index < 105 ? 'needs_review' : 'failed',
        ...(index >= 105 ? { processingStatus: { retryAction: 'contact_admin' } } : {}) });
    const response = await startSearchIndexingAction();
    assert.deepEqual(response, { success: true, queued: 15, needsReview: 0, alreadyReady: 0 });
    assert.deepEqual(new Set(state.queued.map(item => item.recordingId)), new Set(sources.slice(110).map(item => String(item._id))));
    const status = await getSearchIndexingStatusAction();
    assert.equal(status.success, true);
    if (status.success) assert.equal(status.status.needsReview, 10);
});

test('uncertain and already-completed admission races report their outcomes without waking a worker', async () => {
    for (const outcome of ['needs_review', 'completed'] as const) {
        const state = setup();
        const source = recording(); state.db.recordings.values.push(source);
        state.outcomes.set(String(source._id), outcome);
        const response = await startSearchIndexingAction();
        assert.deepEqual(response, { success: true, queued: 0, needsReview: outcome === 'needs_review' ? 1 : 0, alreadyReady: outcome === 'completed' ? 1 : 0 });
        assert.equal(state.after.length, 0);
        assert.equal(state.wakes, 0);
    }
});

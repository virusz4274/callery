import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { ObjectId } from 'mongodb';

type RecordingRow = { _id: ObjectId; authSubject: string; r2Key?: string };
type State = {
    actor: 'admin' | 'user' | null;
    rows: RecordingRow[];
    owners: Set<string>;
    bucket: Set<string>;
    failedKeys: Set<string>;
    requests: string[];
    databaseReads: number;
    failDatabaseDelete: boolean;
    storageGate?: Promise<void>;
    onRequest?: () => void;
    db: ReturnType<typeof database>;
};
const key = Symbol.for('vosift.test.orphan-cleanup');
const shared = globalThis as typeof globalThis & { [key]: State };
const stateReference = `globalThis[Symbol.for('vosift.test.orphan-cleanup')]`;
const hook = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/actions/admin/recordings.ts')) {
        const source = specifier === '@/lib/mongodb'
            ? `export const Collections={USERS:'users',RECORDINGS:'recordings'}; export async function getMongoDb(){return ${stateReference}.db;}`
            : specifier === './auth'
                ? `export async function requireCurrentAdmin(){if(${stateReference}.actor!=='admin')throw new Error('Unauthorized');}`
                : specifier === '@/lib/admin-auth' ? `export function parseObjectId(value){return value;}`
                    : specifier === '@/lib/r2'
                        ? `export async function deleteFromR2(key){const state=${stateReference};state.requests.push(key);state.onRequest?.();if(state.storageGate)await state.storageGate;if(state.failedKeys.has(key))throw new Error('Storage unavailable');state.bucket.delete(key);}`
                        : specifier === '@/lib/logger' ? `export const logger={warn(){}};` : undefined;
        if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    return next(specifier, context);
} });
const { cleanupOrphanedRecordings, getOrphanedRecordingsCount } = await import('./recordings');
hook.deregister();

function database() {
    return { collection(name: string) {
        if (['recording_shares', 'recording_passages'].includes(name)) return { async deleteMany() { return { deletedCount: 0 }; } };
        assert.equal(name, 'recordings');
        return {
            async updateMany() { return { matchedCount: 0, modifiedCount: 0 }; },
            aggregate(pipeline: Record<string, unknown>[]) {
                const state = shared[key];
                state.databaseReads++;
                const orphans = state.rows.filter(row => !state.owners.has(row.authSubject));
                const rows = pipeline.at(-1)?.$count ? orphans.length ? [{ count: orphans.length }] : []
                    : orphans.map(row => ({ ...row }));
                return { toArray: async () => rows };
            },
            async deleteMany(filter: { _id: { $in: ObjectId[] } }) {
                const state = shared[key];
                if (state.failDatabaseDelete) throw new Error('Database deletion unavailable');
                const previous = state.rows.length;
                state.rows = state.rows.filter(row => !filter._id.$in.some(id => id.equals(row._id)));
                return { deletedCount: previous - state.rows.length };
            },
        };
    } };
}

function setup(keys: (string | undefined)[] = ['audio/first.wav', 'audio/second.wav']) {
    const rows = keys.map(r2Key => ({ _id: new ObjectId(), authSubject: 'removed-owner', ...(r2Key === undefined ? {} : { r2Key }) }));
    const state: State = { actor: 'admin', rows, owners: new Set(), bucket: new Set(keys.filter((value): value is string => Boolean(value))),
        failedKeys: new Set(), requests: [], databaseReads: 0, failDatabaseDelete: false, db: database() };
    shared[key] = state;
    return state;
}

test('orphan cleanup removes only successful objects and retains exact failed references for retry', async () => {
    const state = setup();
    const retained = state.rows[1];
    state.failedKeys.add(retained.r2Key!);
    state.owners.add('active-owner');
    state.rows.push({ _id: new ObjectId(), authSubject: 'active-owner', r2Key: 'audio/owned.wav' });
    state.bucket.add('audio/owned.wav');

    assert.equal(await getOrphanedRecordingsCount(), 2);
    assert.deepEqual(await cleanupOrphanedRecordings(), { found: 2, deletedDb: 1, deletedR2: 1, failedCount: 1, remaining: 1 });
    assert.deepEqual(state.rows[0], retained);
    assert.deepEqual([...state.bucket].sort(), ['audio/owned.wav', retained.r2Key!].sort());
    assert.equal(state.requests.includes('audio/owned.wav'), false);

    state.failedKeys.clear();
    assert.deepEqual(await cleanupOrphanedRecordings(), { found: 1, deletedDb: 1, deletedR2: 1, failedCount: 0, remaining: 0 });
    assert.equal(state.rows[0].authSubject, 'active-owner');
    assert.equal(await getOrphanedRecordingsCount(), 0);
});

test('all storage failures preserve every record and an explicit retry succeeds after recovery', async () => {
    const state = setup();
    const original = [...state.rows];
    state.failedKeys = new Set(state.bucket);
    assert.deepEqual(await cleanupOrphanedRecordings(), { found: 2, deletedDb: 0, deletedR2: 0, failedCount: 2, remaining: 2 });
    assert.deepEqual(state.rows, original);
    state.failedKeys.clear();
    assert.deepEqual(await cleanupOrphanedRecordings(), { found: 2, deletedDb: 2, deletedR2: 2, failedCount: 0, remaining: 0 });
    assert.equal(state.bucket.size, 0);
});

test('empty cleanup uses the same result shape and performs no storage deletion', async () => {
    const state = setup([]);
    assert.deepEqual(await cleanupOrphanedRecordings(), { found: 0, deletedDb: 0, deletedR2: 0, failedCount: 0, remaining: 0 });
    assert.deepEqual(state.requests, []);
});

test('duplicate keys are deleted once and missing keys count only as metadata removal', async () => {
    const state = setup(['audio/shared.wav', 'audio/shared.wav', undefined, '']);
    state.failedKeys.add('audio/shared.wav');
    assert.deepEqual(await cleanupOrphanedRecordings(), { found: 4, deletedDb: 2, deletedR2: 0, failedCount: 2, remaining: 2 });
    assert.deepEqual(state.requests, ['audio/shared.wav']);
    state.failedKeys.clear();
    assert.deepEqual(await cleanupOrphanedRecordings(), { found: 2, deletedDb: 2, deletedR2: 1, failedCount: 0, remaining: 0 });
});

test('a database failure after storage success leaves metadata available for an idempotent retry', async () => {
    const state = setup();
    const original = [...state.rows];
    state.failDatabaseDelete = true;
    await assert.rejects(cleanupOrphanedRecordings(), /Database deletion unavailable/);
    assert.deepEqual(state.rows, original);
    assert.equal(state.bucket.size, 0);
    state.failDatabaseDelete = false;
    assert.deepEqual(await cleanupOrphanedRecordings(), { found: 2, deletedDb: 2, deletedR2: 2, failedCount: 0, remaining: 0 });
});

test('unauthenticated and non-admin callers cannot read or delete orphaned records', async () => {
    for (const actor of [null, 'user'] as const) {
        const state = setup();
        state.actor = actor;
        await assert.rejects(cleanupOrphanedRecordings(), /Unauthorized/);
        await assert.rejects(getOrphanedRecordingsCount(), /Unauthorized/);
        assert.equal(state.databaseReads, 0);
        assert.deepEqual(state.requests, []);
        assert.equal(state.rows.length, 2);
    }
});

test('cleanup uses the bounded storage helper and never starts more than eight deletes at once', async () => {
    const state = setup(Array.from({ length: 12 }, (_, index) => `audio/${index}.wav`));
    let release!: () => void;
    state.storageGate = new Promise<void>(resolve => { release = resolve; });
    const saturated = new Promise<void>(resolve => { state.onRequest = () => { if (state.requests.length === 8) resolve(); }; });
    const cleanup = cleanupOrphanedRecordings();
    await saturated;
    assert.equal(state.requests.length, 8);
    release();
    assert.deepEqual(await cleanup, { found: 12, deletedDb: 12, deletedR2: 12, failedCount: 0, remaining: 0 });
});

test('overlapping cleanups use actual database deletion counts and safely repeat storage acknowledgments', async () => {
    const state = setup();
    const results = await Promise.all([cleanupOrphanedRecordings(), cleanupOrphanedRecordings()]);
    assert.equal(results.reduce((sum, result) => sum + result.deletedDb, 0), 2);
    assert.equal(state.rows.length, 0);
    assert.equal(state.bucket.size, 0);
    assert.ok(results.every(result => result.remaining === 0));
});

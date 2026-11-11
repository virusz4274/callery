import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { ObjectId } from 'mongodb';
import { MemoryBillingDatabase, userFixture } from '@/lib/stripe/test-support';
import { AccountClosurePolicyError } from '@/lib/account-closure';

type Row = Record<string, unknown>;
type State = { memory: MemoryBillingDatabase; billing: boolean; financialFailure: boolean; snapshots: string[]; identityRemovals: number };
const key = Symbol.for('vosift.test.account-closure-data');
const shared = globalThis as typeof globalThis & { [key]: State };
const s = `globalThis[Symbol.for('vosift.test.account-closure-data')]`;
const databaseSource = `export const Collections={USERS:'users',RECORDINGS:'recordings',CONTACTS:'contacts',EXPORT_JOBS:'export_jobs',SYSTEM_SETTINGS:'system_settings',SUPPORT_MESSAGES:'support_messages',NOTIFICATIONS:'notifications',TRANSCRIPTION_WEBHOOK_EVENTS:'transcription_webhook_events'};export async function getMongoDb(){return ${s}.memory.asDb();}`;
const hooks = registerHooks({ resolve(specifier, context, next) {
    const parent = context.parentURL || '';
    let source: string | undefined;
    if (specifier === '@/lib/mongodb' || parent.endsWith('/lib/team-policy.ts') && specifier === './mongodb') source = databaseSource;
    if (parent.endsWith('/db/delete-user-data.ts')) {
        if (specifier === '@/lib/config') source = `export function billingEnabled(){return ${s}.billing;}`;
        if (specifier === '@/lib/r2') source = 'export async function deleteFromR2(){}';
        if (specifier === '@/lib/integrations/database') source = `export const IntegrationCollections={tokens:'api_tokens',uploads:'uploads',jobs:'jobs'};`;
        if (specifier === '@/lib/integrations/uploads') source = 'export async function cleanupUpload(){}';
        if (specifier === '@/lib/stripe/financial-settlement') source = `export async function retainFinancialSettlement(user){${s}.snapshots.push(user.authSubject);if(${s}.financialFailure)throw new Error('Synthetic settlement failure');}`;
        if (specifier === '@/lib/export-processor/object-lifecycle') source = 'export async function revokeExportObjects(){return [];}';
        if (specifier === '@/lib/logger') source = 'export const logger={error(){}};';
    }
    if (parent.endsWith('/lib/team-policy.ts')) {
        if (specifier === './db/users') source = `export async function getSystemSettings(){return ${s}.memory.asDb().collection('system_settings').findOne({});}export async function findUserByAuthSubject(subject){return ${s}.memory.asDb().collection('users').findOne({authSubject:subject});}`;
        if (specifier === './db/recordings') source = 'export async function getRecordingById(){return null;}';
        if (specifier === './db/recordings/hydrate-contacts') source = 'export async function hydrateRecordingContacts(_owner, rows){return rows;}';
    }
    return source ? { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true } : next(specifier, context);
} });
const { deleteUserData } = await import('./delete-user-data');
hooks.deregister();

function setup(role: 'admin' | 'user' = 'user') {
    const memory = new MemoryBillingDatabase();
    const collection = memory.collection.bind(memory);
    memory.collection = name => {
        const rows = collection(name);
        Object.assign(rows, {
            async deleteMany(filter: Row) {
                const ids = (await rows.find(filter).toArray()).map(row => String(row._id));
                const count = rows.values.length;
                rows.values = rows.values.filter(row => !ids.includes(String(row._id)));
                return { deletedCount: count - rows.values.length };
            },
            async deleteOne(filter: Row) {
                const row = await rows.findOne(filter);
                if (!row) return { deletedCount: 0 };
                const index = rows.values.findIndex(candidate => String(candidate._id) === String(row._id));
                rows.values.splice(index, 1);
                return { deletedCount: 1 };
            },
            async updateMany(filter: Row, update: Row) {
                const candidates = await rows.find(filter).toArray();
                for (const row of candidates) await rows.updateOne({ _id: row._id }, update);
                return { matchedCount: candidates.length, modifiedCount: candidates.length };
            },
        });
        return rows;
    };
    const state: State = { memory, billing: false, financialFailure: false, snapshots: [], identityRemovals: 0 };
    shared[key] = state;
    const subject = new ObjectId().toString();
    memory.collection('users').values.push(userFixture({ authSubject: subject, role }) as unknown as Row);
    memory.collection('system_settings').values.push({ _id: new ObjectId(), team: { enabled: false } });
    memory.collection('session').values.push({ _id: new ObjectId(), userId: subject }, { _id: new ObjectId(), userId: new ObjectId(subject) });
    memory.collection('api_tokens').values.push({ _id: new ObjectId(), owner: subject });
    memory.collection('recordings').values.push({ _id: new ObjectId(), authSubject: subject, r2Key: 'private/audio.wav' });
    const dependencies = { db: memory.asDb(), removeIdentity: async () => { state.identityRemovals++; } };
    return { state, memory, subject, dependencies };
}

test('company policy and sole active administrator are rejected before closure acceptance', async () => {
    {
        const { memory, subject, dependencies } = setup();
        memory.collection('system_settings').values[0].team = { enabled: true };
        await assert.rejects(deleteUserData(subject, dependencies), AccountClosurePolicyError);
        assert.equal(memory.user().disabled, undefined);
    }
    {
        const { memory, subject, dependencies } = setup('admin');
        memory.collection('users').values.push(
            userFixture({ authSubject: 'disabled-admin', role: 'admin', disabled: true }) as unknown as Row,
            userFixture({ authSubject: 'invited-admin', role: 'admin', teamInvitationPending: true }) as unknown as Row,
        );
        await assert.rejects(deleteUserData(subject, dependencies), /another user an administrator/);
        assert.equal(memory.user().disabled, undefined);
        assert.equal(memory.collection('session').values.length, 2);
    }
});

test('an administrator can close after another active administrator exists', async () => {
    const { memory, subject, dependencies } = setup('admin');
    memory.collection('users').values.push(userFixture({ authSubject: new ObjectId().toString(), role: 'admin' }) as unknown as Row);
    const result = await deleteUserData(subject, dependencies);
    assert.equal(result.cleanupPending, false);
    assert.equal(result.recordingsDeleted, 1);
    assert.equal(memory.collection('users').values.length, 1);
});

test('storage failure disables access, revokes sessions/tokens and retains keys until retry succeeds', async () => {
    const { memory, state, subject, dependencies } = setup();
    for (const name of ['recording_shares', 'recording_passages']) memory.collection(name).values.push(
        { _id: new ObjectId(), owner: subject }, { _id: new ObjectId(), owner: 'another-account' },
    );
    const waiting = await deleteUserData(subject, { ...dependencies, removeObject: async () => { throw new Error('Synthetic storage failure'); } });
    assert.equal(waiting.cleanupPending, true);
    assert.deepEqual(waiting.r2Failures, ['private/audio.wav']);
    assert.equal(memory.user().disabled, true);
    assert.ok(memory.user().accessRevokedAt);
    assert.equal(memory.collection('session').values.length, 0);
    assert.ok(memory.collection('api_tokens').values[0].revokedAt);
    assert.equal(memory.collection('recordings').values[0].r2Key, 'private/audio.wav');
    assert.equal(state.identityRemovals, 0);
    assert.equal(memory.collection('recording_passages').values.length, 2);
    const complete = await deleteUserData(subject, { ...dependencies, removeObject: async () => {} });
    assert.equal(complete.cleanupPending, false);
    assert.equal(memory.collection('users').values.length, 0);
    assert.equal(memory.collection('recordings').values.length, 0);
    assert.equal(state.identityRemovals, 1);
    for (const name of ['recording_shares', 'recording_passages']) assert.deepEqual(memory.collection(name).values.map(row => row.owner), ['another-account']);
});

test('an active work lease accepts closure while retaining its archive for cron retry', async () => {
    const { memory, subject, dependencies } = setup();
    memory.collection('jobs').values.push({ _id: new ObjectId(), owner: subject, state: 'running', leaseUntil: new Date(Date.now() + 60_000) });
    const waiting = await deleteUserData(subject, dependencies);
    assert.equal(waiting.cleanupPending, true);
    assert.equal(memory.collection('session').values.length, 0);
    assert.equal(memory.collection('recordings').values.length, 1);
    memory.collection('jobs').values[0].leaseUntil = new Date(0);
    assert.equal((await deleteUserData(subject, dependencies)).cleanupPending, false);
});

test('failure before disabling is rejected, while settlement or database failures afterward stay accepted', async () => {
    {
        const { memory, subject, dependencies } = setup();
        const users = memory.collection('users');
        users.updateOne = async () => { throw new Error('Synthetic disable failure'); };
        await assert.rejects(deleteUserData(subject, dependencies), /disable failure/);
        assert.equal(memory.user().disabled, undefined);
    }
    {
        const { memory, state, subject, dependencies } = setup();
        state.billing = true; state.financialFailure = true;
        assert.equal((await deleteUserData(subject, dependencies)).cleanupPending, true);
        assert.equal(memory.user().disabled, true);
        assert.equal(memory.collection('session').values.length, 0);
        assert.equal(memory.collection('recordings').values.length, 1);
        state.financialFailure = false;
        assert.equal((await deleteUserData(subject, dependencies)).cleanupPending, false);
        assert.ok(state.snapshots.length >= 2);
    }
});

test('database failure after deleting audio keeps metadata and a later deletion safely retries', async () => {
    const { memory, subject, dependencies } = setup();
    const recordings = memory.collection('recordings');
    const originalCollection = memory.collection.bind(memory);
    let fail = true, objectsDeleted = 0;
    memory.collection = name => {
        const rows = originalCollection(name);
        if (name === 'recordings' && fail) Object.assign(rows, { async deleteMany() { throw new Error('Synthetic metadata failure'); } });
        return rows;
    };
    const removeObject = async () => { objectsDeleted++; };
    assert.equal((await deleteUserData(subject, { ...dependencies, removeObject })).cleanupPending, true);
    assert.equal(recordings.values.length, 1);
    fail = false;
    assert.equal((await deleteUserData(subject, { ...dependencies, removeObject })).cleanupPending, false);
    assert.equal(objectsDeleted, 2);
});

test('an access-lease release error cannot turn a completed closure into a failure', async () => {
    const { memory, subject, dependencies } = setup();
    const settings = memory.collection('system_settings');
    const update = settings.updateOne.bind(settings);
    settings.updateOne = async (filter, patch, options) => {
        if (!Array.isArray(patch) && patch.$unset) throw new Error('Synthetic lock release failure');
        return update(filter, patch, options);
    };
    const result = await deleteUserData(subject, dependencies);
    assert.equal(result.cleanupPending, false);
    assert.equal(memory.collection('users').values.length, 0);
});

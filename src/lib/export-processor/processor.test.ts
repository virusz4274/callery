import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { ObjectId, type Db } from 'mongodb';
import type { ExportJob, Recording } from '@/lib/db/types';
import { MemoryBillingDatabase, userFixture } from '@/lib/stripe/test-support';
import { ExportProcessingError } from './errors';
import type { ExportPartMeta } from './types';

type Upload = (subject: string, jobId: string, partNumber: number, records: Recording[], maximumBytes?: number, token?: string) => Promise<ExportPartMeta>;
type State = {
    memory: MemoryBillingDatabase; db: Db; job: ExportJob; records: Recording[]; revision: string;
    upload: Upload; uploadCalls: number; uploadTokens: (string | undefined)[];
    stored: Map<string, number>; headError?: Error; logs: unknown[][];
    emails: number; notifications: number; emailError?: Error; notificationError?: Error;
    settlements: boolean[];
};
const symbol = Symbol.for('vosift.test.export-processor');
const shared = globalThis as typeof globalThis & { [symbol]: State };
const stateRef = "globalThis[Symbol.for('vosift.test.export-processor')]";
const hook = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL && /\/(?:export-processor\.ts|db\/export-jobs\.ts|export-processor\/(?:lifecycle|object-lifecycle|failed-retry)\.ts)$/.test(context.parentURL)) {
        const source = specifier === '@/lib/mongodb' ? `export const Collections={USERS:'users',EXPORT_JOBS:'export_jobs'};export async function getMongoDb(){return ${stateRef}.db;}`
            : specifier === '@/lib/db/users' ? `export async function findUserByAuthSubject(subject){return ${stateRef}.db.collection('users').findOne({authSubject:subject});}`
            : specifier === '@/lib/db/recordings' ? `export async function countRecordingsForExport(){return ${stateRef}.records.length;}export async function getRecordingsPageForExport(subject,size,cursor){return cursor?[]:${stateRef}.records;}`
            : specifier === '@/lib/team-policy' ? `export async function resolveExportSubject(subject){return subject;}`
            : specifier === '@/lib/export-processor/policy' || specifier === './policy' ? `export async function getExportSourceSnapshot(){return {revision:${stateRef}.revision};}export async function getRecoveryExport(){return undefined;}export async function finishExportBudget(subject,budget,started){${stateRef}.settlements.push(started);}`
            : specifier === '@/lib/export-processor/archive' ? `export async function ensurePartUploaded(...args){const state=${stateRef};state.uploadCalls++;state.uploadTokens.push(args[5]);return state.upload(...args);}`
            : specifier === '@/lib/r2' ? `export function storageBucket(){return 'synthetic';}export function getStorageClient(){throw new Error('Unexpected live storage call');}export async function getSignedR2Url(key){return 'https://download.example.test/'+encodeURIComponent(key);}`
            : specifier === './storage-client' ? `export function getExportStorageClient(){return {async send(command){const state=${stateRef};if(command.constructor.name!=='HeadObjectCommand')throw new Error('Unexpected fixture command');if(state.headError)throw state.headError;return {ContentLength:state.stored.get(command.input.Key)};}};}`
            : specifier === '@/lib/email' ? `export async function sendNotificationEmail(){const state=${stateRef};state.emails++;if(state.emailError)throw state.emailError;}`
            : specifier === '@/lib/notifications' ? `export async function createNotification(){const state=${stateRef};state.notifications++;if(state.notificationError)throw state.notificationError;}`
            : specifier === '@/lib/logger' ? `const log=(...args)=>${stateRef}.logs.push(args);export const logger={info:log,warn:log,error:log};`
            : specifier === '@/lib/env' ? `export const env={EXPORT_JOB_STALE_MINUTES:90};`
            : specifier === '@/lib/stripe/ledger' ? `export const ledgerKey=value=>value;`
            : specifier === '@/lib/stripe/legacy-operator-costs' ? `export async function getOperatorCost(){throw new Error('Unexpected legacy funding read');}`
            : undefined;
        if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    return next(specifier, context);
} });
const { processExport } = await import('@/lib/export-processor');
const { claimExportJob, getExportJob } = await import('@/lib/db/export-jobs');
const { requeueFailedExport } = await import('./failed-retry');
hook.deregister();

function fixture(overrides: Partial<ExportJob> = {}): State {
    const memory = new MemoryBillingDatabase();
    const job: ExportJob = {
        _id: new ObjectId(), authSubject: 'owner', requestedByAuthSubject: 'owner', status: 'pending', progress: 0,
        totalRecordings: 1, processedRecordings: 0, parts: [], checkpoint: { nextPartNumber: 1 },
        sourceRevision: 'immutable-source', archiveExpiresAt: new Date(Date.now() + 86_400_000),
        createdAt: new Date(), updatedAt: new Date(), ...overrides,
    };
    memory.collection('users').values.push(userFixture() as unknown as Record<string, unknown>);
    memory.collection('export_jobs').values.push(job as unknown as Record<string, unknown>);
    const date = new Date('2026-01-01');
    const recording = { _id: new ObjectId(), authSubject: 'owner', fileSize: 15, fileName: 'synthetic.wav',
        r2Key: 'synthetic-source', recordedAt: date, createdAt: date, updatedAt: date } as Recording;
    const state: State = { memory, db: memory.asDb(), job, records: [recording], revision: 'immutable-source',
        uploadCalls: 0, uploadTokens: [], stored: new Map(), logs: [], emails: 0, notifications: 0, settlements: [],
        upload: async (subject, jobId, partNumber, _records, _maximumBytes, token) => {
            assert.equal(token, job.workerToken);
            const key = `exports/${subject}/${jobId}/${token}/part_${partNumber}.zip`;
            state.stored.set(key, 123);
            memory.collection('export_object_cleanup').values.push({ _id: key, subject, jobId, owner: 'object-owner', state: 'ready',
                leaseUntil: new Date(0), expiresAt: new Date(Date.now() + 86_400_000), createdAt: new Date() });
            return { key, size: 123 };
        },
    };
    shared[symbol] = state;
    return state;
}

function transportFailure(): ExportProcessingError {
    return new ExportProcessingError('archive-upload', 'transport', new TypeError('fetch failed', {
        cause: Object.assign(new Error('private-storage-endpoint-and-secret'), { code: 'ECONNRESET' }),
    }));
}

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    return { promise, resolve };
}

function assertTerminalLeaseReleased(job: ExportJob) {
    assert.equal(job.workerToken, undefined);
    assert.equal(job.workerLeaseUntil, undefined);
}

function addSavedCheckpoint(state: State) {
    const key = `exports/owner/${state.job._id}/previous-worker/part_1.zip`;
    state.job.processedRecordings = 1;
    state.job.parts = [{ key, size: 123, url: '', expiresAt: new Date(0) }];
    state.job.checkpoint = { nextPartNumber: 2, cursorId: state.records[0]._id.toString(), cursorRecordedAt: state.records[0].recordedAt };
    state.stored.set(key, 123);
    const intent = { _id: key, subject: 'owner', jobId: state.job._id.toString(), owner: 'previous-object-owner', state: 'ready',
        leaseUntil: new Date(0), expiresAt: new Date(Date.now() + 60_000), createdAt: new Date() };
    state.memory.collection('export_object_cleanup').values.push(intent);
    return intent;
}

test('the real processor claims, checkpoints and completes one archive before releasing its lease', async () => {
    const state = fixture();
    await processExport(state.job._id.toString(), 'owner');
    assert.equal(state.job.status, 'completed');
    assert.equal(state.job.generationAttempts, 1);
    assert.equal(state.job.processedRecordings, 1);
    assert.equal(state.job.progress, 100);
    assert.equal(state.job.parts.length, 1);
    assert.equal(state.job.checkpoint.nextPartNumber, 2);
    assert.equal(state.job.cacheEligible, true);
    assert.ok(state.job.completedAt instanceof Date);
    assert.equal(state.uploadCalls, 1);
    assert.equal(state.emails, 1);
    assert.equal(state.notifications, 1);
    assertTerminalLeaseReleased(state.job);
});

test('duplicate processor entry points cannot generate the same pending archive twice', async () => {
    const state = fixture();
    await Promise.all([processExport(state.job._id.toString(), 'owner'), processExport(state.job._id.toString(), 'owner')]);
    assert.equal(state.job.status, 'completed');
    assert.equal(state.job.generationAttempts, 1);
    assert.equal(state.uploadCalls, 1);
    assertTerminalLeaseReleased(state.job);
});

test('cron can pass its claimed token without consuming another generation attempt', async () => {
    const state = fixture();
    const claim = await claimExportJob(state.job._id.toString(), 'owner');
    assert.ok(claim?.workerToken);
    await processExport(state.job._id.toString(), 'owner', 'a-different-token');
    assert.equal(state.uploadCalls, 0);
    assert.equal(state.job.workerToken, claim.workerToken);
    await processExport(state.job._id.toString(), 'owner', claim.workerToken);
    assert.equal(state.job.status, 'completed');
    assert.equal(state.job.generationAttempts, 1);
    assert.equal(state.uploadCalls, 1);
    assertTerminalLeaseReleased(state.job);
});

test('upload failures persist safe stage, transport and attempt details before releasing the terminal token', async () => {
    const state = fixture({ costReservationId: 'synthetic-reservation', maximumCostMicros: 100, costBudgetSource: 'customer' });
    state.upload = async () => { throw transportFailure(); };
    await processExport(state.job._id.toString(), 'owner');
    assert.equal(state.job.status, 'failed');
    assert.equal(state.job.failure?.stage, 'archive-upload');
    assert.equal(state.job.failure?.code, 'transport');
    assert.equal(state.job.failure?.transportCode, 'ECONNRESET');
    assert.equal(state.job.failure?.retryable, true);
    assert.equal(state.job.failure?.generationAttempt, 1);
    assert.equal(state.job.failure?.partNumber, 1);
    assert.ok(state.job.failure?.occurredAt instanceof Date);
    assert.ok(state.job.costStartedAt instanceof Date);
    assert.ok(state.job.costSettledAt instanceof Date);
    assert.deepEqual(state.settlements, [true]);
    assert.equal(state.job.processedRecordings, 0);
    assert.deepEqual(state.job.parts, []);
    assert.equal(JSON.stringify([state.job.failure, state.job.error, state.logs]).includes('private-storage-endpoint-and-secret'), false);
    assertTerminalLeaseReleased(state.job);
});

test('a late failed worker cannot overwrite or release its replacement worker', async () => {
    const state = fixture();
    const enteredFirst = deferred(), enteredSecond = deferred(), finishFirst = deferred(), finishSecond = deferred();
    const upload = state.upload;
    state.upload = async (...args) => {
        if (state.uploadCalls === 1) {
            enteredFirst.resolve();
            await finishFirst.promise;
            throw transportFailure();
        }
        enteredSecond.resolve();
        await finishSecond.promise;
        return upload(...args);
    };
    const first = processExport(state.job._id.toString(), 'owner');
    await enteredFirst.promise;
    const firstToken = state.job.workerToken;
    state.job.workerLeaseUntil = new Date(0);
    const second = processExport(state.job._id.toString(), 'owner');
    await enteredSecond.promise;
    const secondToken = state.job.workerToken;
    assert.notEqual(secondToken, firstToken);
    finishFirst.resolve();
    await first;
    assert.equal(state.job.status, 'processing');
    assert.equal(state.job.workerToken, secondToken);
    assert.equal(state.job.failure, undefined);
    assert.ok(state.job.workerLeaseUntil! > new Date());
    finishSecond.resolve();
    await second;
    assert.equal(state.job.status, 'completed');
    assert.equal(state.job.generationAttempts, 2);
    assert.equal(state.job.failure, undefined);
    assertTerminalLeaseReleased(state.job);
});

test('a failed generation can use the genuine manual requeue path and finish on its second attempt', async () => {
    const state = fixture();
    const upload = state.upload;
    state.upload = async (...args) => {
        if (state.uploadCalls === 1) throw transportFailure();
        return upload(...args);
    };
    const id = state.job._id.toString();
    await processExport(id, 'owner');
    assert.equal(state.job.status, 'failed');
    const failed = await getExportJob(id, 'owner');
    assert.ok(failed);
    let ownershipChecks = 0;
    await requeueFailedExport(failed, 'owner', state.db, async () => { ownershipChecks++; });
    assert.equal(ownershipChecks, 1);
    assert.equal(state.job.status, 'pending');
    assert.equal(state.job.generationAttempts, 1);
    await processExport(id, 'owner');
    assert.equal(state.job.status, 'completed');
    assert.equal(state.job.generationAttempts, 2);
    assert.equal(state.uploadCalls, 2);
    assert.equal(state.memory.collection('export_jobs').values.length, 1);
    assert.equal(state.job.failure, undefined);
    assert.equal(state.job.error, undefined);
    assert.equal(state.emails, 1);
    assertTerminalLeaseReleased(state.job);
    await processExport(id, 'owner');
    assert.equal(state.uploadCalls, 2);
});

test('email and in-app notification failures preserve a durably completed archive', async () => {
    const state = fixture();
    state.emailError = new Error('private-email-provider-message');
    state.notificationError = new Error('private-notification-database-message');
    await processExport(state.job._id.toString(), 'owner');
    assert.equal(state.job.status, 'completed');
    assert.equal(state.job.failure, undefined);
    assert.equal(state.job.error, undefined);
    assert.equal(state.job.generationAttempts, 1);
    assert.equal(state.job.parts.length, 1);
    assert.equal(state.emails, 1);
    assert.equal(state.notifications, 1);
    assert.equal(JSON.stringify(state.logs).includes('private-'), false);
    assertTerminalLeaseReleased(state.job);
});

test('source revision failures are terminal and release an unused legacy hold without uploading', async () => {
    const state = fixture({ costReservationId: 'unused-reservation', maximumCostMicros: 100 });
    state.revision = 'source-changed';
    await processExport(state.job._id.toString(), 'owner');
    assert.equal(state.job.status, 'failed');
    assert.equal(state.job.failure?.stage, 'validation');
    assert.equal(state.job.failure?.code, 'source-changed');
    assert.equal(state.job.failure?.retryable, false);
    assert.equal(state.uploadCalls, 0);
    assert.equal(state.job.costStartedAt, undefined);
    assert.deepEqual(state.settlements, [false]);
    assertTerminalLeaseReleased(state.job);
});

test('a recovered checkpoint verifies storage and finishes without regenerating acknowledged parts', async () => {
    const state = fixture({ status: 'processing', updatedAt: new Date(0), generationAttempts: 1 });
    const intent = addSavedCheckpoint(state);
    const originalExpiry = intent.expiresAt.getTime();
    await processExport(state.job._id.toString(), 'owner');
    assert.equal(state.job.status, 'completed');
    assert.equal(state.job.generationAttempts, 2);
    assert.equal(state.uploadCalls, 0);
    assert.equal(state.job.processedRecordings, 1);
    assert.equal(state.job.parts[0].key, intent._id);
    assert.ok(intent.expiresAt.getTime() > originalExpiry);
    assert.equal(intent.expiresAt.getTime(), state.job.archiveExpiresAt!.getTime());
    assertTerminalLeaseReleased(state.job);
});

test('checkpoint HEAD transport errors retain the checkpoint stage and leave saved parts intact', async () => {
    const state = fixture();
    addSavedCheckpoint(state);
    state.headError = new TypeError('fetch failed', { cause: Object.assign(new Error('private-head-endpoint'), { code: 'ECONNRESET' }) });
    await processExport(state.job._id.toString(), 'owner');
    assert.equal(state.job.status, 'failed');
    assert.equal(state.job.failure?.stage, 'checkpoint');
    assert.equal(state.job.failure?.code, 'transport');
    assert.equal(state.job.failure?.transportCode, 'ECONNRESET');
    assert.equal(state.job.failure?.retryable, true);
    assert.equal(state.job.parts.length, 1);
    assert.equal(state.job.processedRecordings, 1);
    assert.equal(state.uploadCalls, 0);
    assert.equal(JSON.stringify(state.logs).includes('private-head-endpoint'), false);
    assertTerminalLeaseReleased(state.job);
});

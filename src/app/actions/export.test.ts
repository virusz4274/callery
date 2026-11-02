import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { ObjectId } from 'mongodb';
import type { ExportJob } from '@/lib/db/types';
import { MemoryBillingDatabase, userFixture } from '@/lib/stripe/test-support';
import { getBillingAccount, ledgerKey } from '@/lib/stripe/ledger';

type State = { memory: MemoryBillingDatabase; actor: string | null; team: boolean; verified: number; checkpointUnavailable: boolean; after: (() => Promise<void>)[]; processed: string[] };
const key = Symbol.for('vosift.test.export-retry-actions');
const shared = globalThis as typeof globalThis & { [key]: State };
const s = `globalThis[Symbol.for('vosift.test.export-retry-actions')]`;
const databaseModule = `export const Collections={USERS:'users',RECORDINGS:'recordings',EXPORT_JOBS:'export_jobs',SYSTEM_SETTINGS:'system_settings'};export async function getMongoDb(){return ${s}.memory.asDb();}`;
const hook = registerHooks({ resolve(specifier, context, next) {
    const parent = context.parentURL || '';
    let source: string | undefined;
    if (specifier === '@/lib/mongodb' || parent.endsWith('/lib/team-policy.ts') && specifier === './mongodb') source = databaseModule;
    if (parent.endsWith('/actions/export.ts')) {
        if (specifier === '@/lib/auth-utils') source = `export async function getAuthSubjectFromSession(){return ${s}.actor;}`;
        if (specifier === 'next/server') source = `export function after(work){${s}.after.push(work);}`;
        if (specifier === '@/lib/export-processor') source = `export async function processExport(jobId){${s}.processed.push(jobId);}`;
        if (specifier === '@/lib/export-processor/downloads') source = `export async function refreshExportDownloadLinks(job){return job;}`;
        if (specifier === '@/lib/export-processor/object-lifecycle') source = `export async function confirmExportJobAdmission(){}`;
    }
    if (parent.endsWith('/lib/team-policy.ts')) {
        if (specifier === './db/users') source = `export async function findUserByAuthSubject(subject){return ${s}.memory.asDb().collection('users').findOne({authSubject:subject});}export async function getSystemSettings(){return {team:{enabled:${s}.team}};}`;
        if (specifier === './db/recordings') source = `export async function getRecordingById(){return null;}`;
        if (specifier === './db/recordings/hydrate-contacts') source = `export async function hydrateRecordingContacts(_subject,rows){return rows;}`;
    }
    if (parent.endsWith('/export-processor/failed-retry.ts') && specifier === './object-lifecycle') {
        source = `export async function verifyCheckpointParts(){${s}.verified++;if(${s}.checkpointUnavailable)throw new Error('Synthetic unavailable object');}`;
    }
    if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    return next(specifier, context);
} });
const { retryExport, getExportStatus, startExport } = await import('./export');
const { getExportSourceSnapshot, assertFreshExportWindow } = await import('@/lib/export-processor/policy');
hook.deregister();

async function setup(overrides: Partial<ExportJob> = {}) {
    const memory = new MemoryBillingDatabase(), db = memory.asDb();
    const state: State = { memory, actor: 'owner', team: false, verified: 0, checkpointUnavailable: false, after: [], processed: [] };
    shared[key] = state;
    memory.collection('users').values.push(userFixture({ role: 'user' }) as unknown as Record<string, unknown>);
    const recordings = memory.collection('recordings');
    recordings.values.push({ _id: new ObjectId(), authSubject: 'owner', updatedAt: new Date('2026-10-01'), fileSize: 100, documentBytes: 50 });
    Object.assign(recordings, { aggregate: () => ({ async *[Symbol.asyncIterator]() { for (const row of recordings.values) yield row; } }) });
    const source = await getExportSourceSnapshot('owner', db);
    const job: ExportJob = {
        _id: new ObjectId(), authSubject: 'owner', requestedByAuthSubject: 'original-requester', status: 'failed',
        progress: 0, totalRecordings: source.count, processedRecordings: 0, parts: [], checkpoint: { nextPartNumber: 1 },
        sourceRevision: source.revision, sourceBytes: source.bytes, estimatedArchiveBytes: source.estimatedArchiveBytes,
        createdAt: new Date(Date.now() - 60_000), updatedAt: new Date(Date.now() - 30_000),
        archiveExpiresAt: new Date(Date.now() + 86400_000), generationAttempts: 1, error: 'fetch failed', ...overrides,
    };
    memory.collection('export_jobs').values.push(job as unknown as Record<string, unknown>);
    return { memory, db, state, job, row: memory.collection('export_jobs').values[0] };
}

test('manual retry requeues the same job without changing checkpoint, archive expiry or fresh quota', async () => {
    const { db, memory, job, row, state } = await setup();
    const snapshot = structuredClone({ createdAt: row.createdAt, archiveExpiresAt: row.archiveExpiresAt, checkpoint: row.checkpoint,
        sourceRevision: row.sourceRevision, sourceBytes: row.sourceBytes, estimatedArchiveBytes: row.estimatedArchiveBytes });
    assert.equal((await getExportStatus())?.retryAvailable, true);
    assert.deepEqual(await retryExport(job._id.toString()), { success: true, jobId: job._id.toString() });
    assert.equal(row.status, 'pending'); assert.equal(row.generationAttempts, 1); assert.equal(row.requestedByAuthSubject, 'owner');
    assert.equal(row.error, undefined); assert.equal(row.failure, undefined);
    for (const [name, value] of Object.entries(snapshot)) assert.deepEqual(row[name], value);
    assert.equal(state.verified, 1); assert.equal(memory.collection('export_jobs').values.length, 1);
    await assert.rejects(assertFreshExportWindow('owner', db), /per 24 hours/);
    assert.deepEqual(await retryExport(job._id.toString()), { success: true, jobId: job._id.toString(), cached: true });
    assert.equal(state.verified, 1);
});

test('Start export still applies the fresh window rather than automatically retrying a failure', async () => {
    const { job, row } = await setup();
    const result = await startExport();
    assert.equal(result.success, false);
    assert.match('message' in result ? result.message : '', /per 24 hours/);
    assert.equal(row.status, 'failed'); assert.equal(row.generationAttempts, 1);
    assert.equal((await getExportStatus())?.id, job._id.toString());
});

test('concurrent manual retry requests enqueue at most one generation', async () => {
    const { job, row, state } = await setup();
    const results = await Promise.all([retryExport(job._id.toString()), retryExport(job._id.toString())]);
    assert.equal(results.filter(result => result.success).length, 1);
    assert.equal(state.verified, 1); assert.equal(row.status, 'pending'); assert.equal(row.generationAttempts, 1);
});

test('retry requires current requester authorization and preserves former employee admin access', async () => {
    const { memory, state, job, row } = await setup();
    state.actor = null;
    await assert.rejects(retryExport(job._id.toString()), /Unauthorized/);
    state.actor = 'another-member';
    memory.collection('users').values.push(userFixture({ _id: new ObjectId(), authSubject: state.actor, role: 'user' }) as unknown as Record<string, unknown>);
    assert.equal((await retryExport(job._id.toString())).success, false);
    await assert.rejects(retryExport(job._id.toString(), memory.user()._id.toString()), /Unauthorized/);
    state.team = true; state.actor = 'active-admin';
    memory.collection('users').values.push(userFixture({ _id: new ObjectId(), authSubject: state.actor, role: 'admin' }) as unknown as Record<string, unknown>);
    memory.user().disabled = true;
    const result = await retryExport(job._id.toString(), memory.user()._id.toString());
    assert.equal(result.success, true); assert.equal(row.requestedByAuthSubject, 'active-admin'); assert.equal(row.authSubject, 'owner');
});

test('unsafe or exhausted failed jobs expose a reason and remain failed', async () => {
    const scenarios: [Partial<ExportJob>, RegExp][] = [
        [{ generationAttempts: 2 }, /single retry/], [{ cleanupPending: true }, /being removed/],
        [{ abortedAt: new Date() }, /being removed/], [{ cleanedAt: new Date() }, /being removed/],
        [{ archiveExpiresAt: new Date(0) }, /expired/], [{ sourceRevision: undefined }, /older export/],
        [{ error: 'unknown provider message' }, /cannot be retried/],
        [{ failure: { stage: 'archive-upload', code: 'permission', retryable: false, occurredAt: new Date() } }, /cannot be retried/],
        [{ checkpoint: { nextPartNumber: 2 } }, /older export/],
    ];
    for (const [overrides, reason] of scenarios) {
        const { job, row } = await setup(overrides);
        const status = await getExportStatus();
        assert.equal(status?.retryAvailable, false); assert.match(status?.retryUnavailableReason || '', reason);
        const result = await retryExport(job._id.toString());
        assert.equal(result.success, false); assert.match('message' in result ? result.message : '', reason);
        assert.equal(row.status, 'failed');
    }
});

test('legacy fetch failures count one original attempt, while typed transient failures can retry', async () => {
    const { job, row } = await setup({ generationAttempts: undefined });
    assert.equal((await retryExport(job._id.toString())).success, true); assert.equal(row.generationAttempts, 1);
    const next = await setup({ error: 'A recording could not be downloaded from storage.', failure: {
        stage: 'source-download', code: 'storage', retryable: true, httpStatus: 503, occurredAt: new Date(),
    } });
    assert.equal((await retryExport(next.job._id.toString())).success, true);
});

test('source changes, missing checkpoint objects, old jobs and a lost cleanup CAS refuse recovery', async () => {
    {
        const { memory, job } = await setup();
        memory.collection('recordings').values[0].updatedAt = new Date();
        const result = await retryExport(job._id.toString());
        assert.match('message' in result ? result.message || '' : '', /Recordings changed/);
    }
    {
        const { state, job, row } = await setup(); state.checkpointUnavailable = true;
        const result = await retryExport(job._id.toString());
        assert.match('message' in result ? result.message || '' : '', /saved archive parts could not be verified/); assert.equal(row.status, 'failed');
    }
    {
        const { memory, job } = await setup();
        memory.collection('export_jobs').values.unshift({ _id: new ObjectId(), authSubject: 'owner', status: 'completed' });
        const result = await retryExport(job._id.toString());
        assert.match('message' in result ? result.message || '' : '', /latest failed export/);
    }
    {
        const { memory, job, row } = await setup();
        const jobs = memory.collection('export_jobs'), update = jobs.updateOne.bind(jobs);
        Object.assign(jobs, { updateOne: async (filter: Record<string, unknown>, patch: Record<string, unknown>) => {
            if ((patch.$set as Record<string, unknown>)?.status === 'pending') row.cleanupPending = true;
            return update(filter, patch);
        } });
        const result = await retryExport(job._id.toString());
        assert.match('message' in result ? result.message || '' : '', /changed while its retry/); assert.equal(row.status, 'failed');
    }
});

test('manual retry preserves the single billing recovery identity and refuses ended or unrelated windows', async () => {
    const { memory, job, row } = await setup({ exportAdmissionVersion: 2, exportAccessSource: 'recovery', recoveryClaimId: 'accepted-recovery' });
    memory.user().billingRecovery = { startedAt: new Date(Date.now() - 86400_000), purgeAt: new Date(Date.now() + 86400_000), warnings: [], exportJobId: job._id.toString() };
    assert.equal((await retryExport(job._id.toString())).success, true);
    assert.equal(row.recoveryClaimId, 'accepted-recovery'); assert.equal(row.exportAccessSource, 'recovery');
    assert.equal(memory.user().billingRecovery?.exportJobId, job._id.toString());
    for (const mode of ['expired', 'different', 'purging'] as const) {
        const next = await setup();
        next.memory.user().billingRecovery = { startedAt: new Date(), purgeAt: new Date(mode === 'expired' ? 0 : Date.now() + 86400_000), warnings: [],
            exportJobId: mode === 'different' ? new ObjectId().toString() : next.job._id.toString(), ...(mode === 'purging' ? { purgingAt: new Date() } : {}) };
        assert.equal((await retryExport(next.job._id.toString())).success, false); assert.equal(next.row.status, 'failed');
    }
});

test('export status selects the current failed recovery identity ahead of unrelated later archives', async () => {
    const { memory, job } = await setup({ exportAdmissionVersion: 2, exportAccessSource: 'recovery', recoveryClaimId: 'accepted-recovery' });
    memory.user().billingRecovery = { startedAt: new Date(Date.now() - 86400_000), purgeAt: new Date(Date.now() + 86400_000), warnings: [], exportJobId: job._id.toString() };
    memory.collection('export_jobs').values.unshift({ _id: new ObjectId(), authSubject: 'owner', status: 'pending' });
    const status = await getExportStatus();
    assert.equal(status?.id, job._id.toString()); assert.equal(status?.retryAvailable, true);
});

test('idempotent retry responses still reject expired, revoked and unrelated queued archives', async () => {
    for (const mode of ['expired', 'revoked', 'old', 'other-recovery', 'ended-recovery'] as const) {
        const { job, memory, row } = await setup({ status: 'pending' });
        if (mode === 'expired') row.archiveExpiresAt = new Date(0);
        if (mode === 'revoked') row.cleanupPending = true;
        if (mode === 'old') memory.collection('export_jobs').values.unshift({ _id: new ObjectId(), authSubject: 'owner', status: 'pending' });
        if (mode === 'other-recovery' || mode === 'ended-recovery') memory.user().billingRecovery = {
            startedAt: new Date(), purgeAt: new Date(mode === 'ended-recovery' ? 0 : Date.now() + 86400_000), warnings: [],
            exportJobId: mode === 'other-recovery' ? new ObjectId().toString() : job._id.toString(),
        };
        assert.equal((await retryExport(job._id.toString())).success, false);
        assert.equal(row.status, 'pending'); assert.equal(row.generationAttempts, 1);
    }
});

test('legacy retry retains an accepted started cost cap and never reopens a released hold', async () => {
    for (const state of ['settled', 'released', 'partial-settlement'] as const) {
        const { memory, job, row } = await setup({ costReservationId: 'accepted-export', maximumCostMicros: 42,
            costBudgetSource: 'customer', costStartedAt: new Date(), costSettledAt: new Date() });
        memory.user().billingAccount = getBillingAccount({});
        memory.user().billingAccount!.reservations[ledgerKey('accepted-export')] = {
            id: 'accepted-export', kind: 'export', maximumCostMicros: 42, retailMicros: 0, allocations: {},
            state: state === 'released' ? 'released' : 'settled', actualCostMicros: state === 'partial-settlement' ? 1 : 42, createdAt: new Date(), expiresAt: new Date(),
        };
        assert.equal((await retryExport(job._id.toString())).success, state === 'settled');
        assert.equal(row.maximumCostMicros, 42); assert.equal(row.costReservationId, 'accepted-export');
        assert.equal(memory.user().billingAccount!.reservations[ledgerKey('accepted-export')].state, state === 'released' ? 'released' : 'settled');
    }
});

test('development schedules a queued retry exactly once without running work inside admission', async t => {
    const { state, job } = await setup();
    const previous = process.env.NODE_ENV; Object.assign(process.env, { NODE_ENV: 'development' });
    t.after(() => { Object.assign(process.env, { NODE_ENV: previous }); });
    assert.equal((await retryExport(job._id.toString())).success, true);
    assert.equal((await retryExport(job._id.toString())).success, true);
    assert.equal(state.after.length, 1); assert.deepEqual(state.processed, []);
    await state.after[0](); assert.deepEqual(state.processed, [job._id.toString()]);
});

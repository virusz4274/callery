import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import type { ExportJob } from '@/lib/db/types';
import { claimExportJob, claimNextExportJob, heartbeatExportJob, assertExportWorkerOwned, updateActiveExportJob } from '@/lib/db/export-jobs';
import { MemoryBillingDatabase, userFixture } from '@/lib/stripe/test-support';
import { beginExportObjectWrite, cleanupExportObjectWrites, completeExportObjectWrite, confirmExportJobAdmission, EXPORT_OBJECT_WRITES, verifyCheckpointParts, renewExportParts } from './object-lifecycle';
import { cleanupExpiredExports } from './cleanup';

function fixture(overrides: Partial<ExportJob> = {}) {
    const memory = new MemoryBillingDatabase();
    const job: ExportJob = {
        _id: new ObjectId(), authSubject: 'owner', status: 'pending', progress: 0,
        totalRecordings: 2, processedRecordings: 0, parts: [], checkpoint: { nextPartNumber: 1 },
        createdAt: new Date(), updatedAt: new Date(), archiveExpiresAt: new Date(Date.now() + 86_400_000),
        ...overrides,
    };
    memory.collection('users').values.push(userFixture() as unknown as Record<string, unknown>);
    memory.collection('export_jobs').values.push(job as unknown as Record<string, unknown>);
    return { memory, db: memory.asDb(), job, id: job._id.toString() };
}

function checkpointFixture() {
    const state = fixture();
    const key = `exports/owner/${state.id}/previous-worker/part_1.zip`;
    state.job.parts = [{ key, size: 123, url: '', expiresAt: new Date(0) }];
    state.job.processedRecordings = 1;
    state.job.checkpoint = { nextPartNumber: 2, cursorId: new ObjectId().toString(), cursorRecordedAt: new Date() };
    const intent = {
        _id: key, subject: 'owner', jobId: state.id, owner: 'object-owner', state: 'ready',
        leaseUntil: new Date(0), expiresAt: new Date(Date.now() + 86_400_000), createdAt: new Date(),
    };
    state.memory.collection(EXPORT_OBJECT_WRITES).values.push(intent);
    return { ...state, intent, key };
}

test('transient admission and completion checks preserve their transport cause without revoking the archive', async () => {
    const { db, job, id, memory } = fixture();
    const intent = await beginExportObjectWrite('owner', id, `exports/owner/${id}/synthetic-part.zip`, db);
    const users = memory.collection('users');
    const originalFind = users.findOne.bind(users);
    const failure = Object.assign(new Error('Synthetic database outage'), { code: 'ECONNRESET' });
    users.findOne = async () => { throw failure; };
    await assert.rejects(confirmExportJobAdmission(job, db), error => error === failure);
    await assert.rejects(completeExportObjectWrite(intent, db), error => error === failure);
    assert.equal(job.cleanupPending, undefined);
    assert.equal(job.abortedAt, undefined);
    assert.equal(memory.collection(EXPORT_OBJECT_WRITES).values[0].state, 'writing');
    users.findOne = originalFind;
});

test('inline and cron claims grant one worker and consume one generation attempt', async () => {
    const { db, id, memory } = fixture();
    const claims = await Promise.all([
        claimExportJob(id, 'owner', 180, db), claimNextExportJob(180, db),
        claimExportJob(id, 'owner', 180, db), claimNextExportJob(180, db),
    ]);
    const winners = claims.filter((claim): claim is ExportJob => claim !== null);
    assert.equal(winners.length, 1);
    assert.equal(winners[0].status, 'processing');
    assert.equal(winners[0].generationAttempts, 1);
    assert.equal(typeof winners[0].workerToken, 'string');
    assert.ok(winners[0].workerToken);
    assert.ok(winners[0].workerLeaseUntil! > new Date());
    assert.equal(memory.collection('export_jobs').values[0].generationAttempts, 1);
});

test('a live lease prevents reclaim even when updatedAt looks stale, and heartbeat renews it', async () => {
    const { db, id, job } = fixture();
    const claimed = await claimExportJob(id, 'owner', 180, db);
    assert.ok(claimed?.workerToken);
    job.updatedAt = new Date(0);
    job.workerLeaseUntil = new Date(Date.now() + 60_000);
    assert.equal(await claimExportJob(id, 'owner', 180, db), null);
    assert.equal(await claimNextExportJob(180, db), null);
    const before = job.workerLeaseUntil.getTime();
    assert.equal(await heartbeatExportJob(id, 'owner', claimed.workerToken, 180, db), true);
    assert.ok(job.workerLeaseUntil!.getTime() > before);
    assert.equal(job.generationAttempts, 1);
});

test('expired workers lose heartbeat and publication rights after the single recovery claim', async () => {
    const { db, id, job } = fixture();
    const first = await claimExportJob(id, 'owner', 180, db);
    assert.ok(first?.workerToken);
    job.workerLeaseUntil = new Date(0);
    assert.equal(await heartbeatExportJob(id, 'owner', first.workerToken, 180, db), false);
    await assert.rejects(assertExportWorkerOwned(id, 'owner', first.workerToken, db));
    const recovery = await claimNextExportJob(180, db);
    assert.ok(recovery?.workerToken);
    assert.notEqual(recovery.workerToken, first.workerToken);
    assert.equal(recovery.generationAttempts, 2);
    assert.equal(await heartbeatExportJob(id, 'owner', first.workerToken, 180, db), false);
    await assert.rejects(updateActiveExportJob(id, 'owner', { status: 'failed', error: 'late failure' }, db, first.workerToken));
    await assert.rejects(updateActiveExportJob(id, 'owner', { status: 'completed', progress: 100 }, db, first.workerToken));
    assert.equal(job.status, 'processing');
    assert.equal(job.error, undefined);
    await assertExportWorkerOwned(id, 'owner', recovery.workerToken, db);
    await updateActiveExportJob(id, 'owner', { progress: 50 }, db, recovery.workerToken);
    assert.equal(job.progress, 50);
});

test('legacy stale processing jobs use their recovery attempt while fresh jobs remain owned', async () => {
    const stale = fixture({ status: 'processing', updatedAt: new Date(0) });
    const claimed = await claimExportJob(stale.id, 'owner', 180, stale.db);
    assert.ok(claimed?.workerToken);
    assert.equal(claimed.generationAttempts, 2);
    const fresh = fixture({ status: 'processing' });
    assert.equal(await claimExportJob(fresh.id, 'owner', 180, fresh.db), null);
    assert.equal(await claimNextExportJob(180, fresh.db), null);
});

test('exhausted queued and stale jobs become terminal without issuing a third worker', async () => {
    for (const status of ['pending', 'processing'] as const) {
        const { db, id, job } = fixture({ status, generationAttempts: 2, updatedAt: new Date(0), workerLeaseUntil: new Date(0) });
        assert.equal(await claimExportJob(id, 'owner', 180, db), null);
        assert.equal(await claimNextExportJob(180, db), null);
        assert.equal(job.generationAttempts, 2);
        assert.equal(job.status, 'failed');
    }
});

test('terminal and cleanup-fenced exports cannot issue workers or accept worker updates', async () => {
    const fences: Partial<ExportJob>[] = [
        { status: 'failed' }, { status: 'completed' }, { cleanupPending: true },
        { abortedAt: new Date() }, { cleanedAt: new Date() },
    ];
    for (const fence of fences) {
        const { db, id, job } = fixture(fence);
        assert.equal(await claimExportJob(id, 'owner', 180, db), null);
        assert.equal(await claimNextExportJob(180, db), null);
        assert.equal(job.generationAttempts, undefined);
    }
    const { db, id, job } = fixture();
    const claimed = await claimExportJob(id, 'owner', 180, db);
    assert.ok(claimed?.workerToken);
    job.cleanupPending = true;
    assert.equal(await heartbeatExportJob(id, 'owner', claimed.workerToken, 180, db), false);
    await assert.rejects(assertExportWorkerOwned(id, 'owner', claimed.workerToken, db));
    await assert.rejects(updateActiveExportJob(id, 'owner', { progress: 50 }, db, claimed.workerToken));
    assert.equal(job.progress, 0);
});

test('cleanup racing between a claim read and compare-and-set still prevents admission', async () => {
    const { memory, db, id, job } = fixture();
    const rows = memory.collection('export_jobs');
    const findOne = rows.findOne.bind(rows);
    Object.assign(rows, { findOne: async (filter: Record<string, unknown>) => {
        const candidate = await findOne(filter);
        job.cleanupPending = true;
        return candidate;
    } });
    assert.equal(await claimExportJob(id, 'owner', 180, db), null);
    assert.equal(job.generationAttempts, undefined);
    assert.equal(job.workerToken, undefined);
});

test('late storage writes from a replaced worker cannot publish their intent', async () => {
    const { db, id, job, memory } = fixture();
    const first = await claimExportJob(id, 'owner', 180, db);
    assert.ok(first?.workerToken);
    const key = `exports/owner/${id}/${first.workerToken}/part_1.zip`;
    const intent = await beginExportObjectWrite('owner', id, key, db, first.workerToken);
    job.workerLeaseUntil = new Date(0);
    const recovery = await claimExportJob(id, 'owner', 180, db);
    assert.ok(recovery?.workerToken);
    assert.equal(await completeExportObjectWrite(intent, db, first.workerToken), false);
    assert.equal(memory.collection(EXPORT_OBJECT_WRITES).values[0].state, 'pending');
    assert.equal(job.workerToken, recovery.workerToken);
});

test('checkpoint reuse verifies every ready intent and the stored object size', async () => {
    const { db, job, key } = checkpointFixture();
    const checked: string[] = [];
    await verifyCheckpointParts(job, db, async objectKey => { checked.push(objectKey); return 123; });
    assert.deepEqual(checked, [key]);
    await assert.rejects(verifyCheckpointParts(job, db, async () => null));
    await assert.rejects(verifyCheckpointParts(job, db, async () => 122));
    await assert.rejects(verifyCheckpointParts(job, db, async () => { throw new Error('Storage unavailable'); }), /Storage unavailable/);
});

test('checkpoint reuse rejects absent, revoked, expired and foreign object intents before HEAD', async () => {
    const changes = [
        { state: 'pending' }, { state: 'writing' }, { expiresAt: new Date(0) },
        { subject: 'someone-else' }, { jobId: new ObjectId().toString() },
    ];
    for (const change of changes) {
        const { db, job, intent } = checkpointFixture();
        Object.assign(intent, change);
        let heads = 0;
        await assert.rejects(verifyCheckpointParts(job, db, async () => { heads += 1; return 123; }));
        assert.equal(heads, 0);
    }
    const { db, job, memory } = checkpointFixture();
    memory.collection(EXPORT_OBJECT_WRITES).values = [];
    await assert.rejects(verifyCheckpointParts(job, db, async () => { assert.fail('HEAD must not run without an intent'); }));
});

test('renewing resumed archive parts extends ready intents and preserves revocation', async () => {
    const { db, job, intent } = checkpointFixture();
    const expiresAt = new Date(Date.now() + 2 * 86_400_000);
    await renewExportParts(job, expiresAt, db);
    assert.equal(intent.expiresAt.getTime(), expiresAt.getTime());
    intent.state = 'pending';
    await assert.rejects(renewExportParts(job, new Date(Date.now() + 3 * 86_400_000), db));
    assert.equal(intent.state, 'pending');
    assert.equal(intent.expiresAt.getTime(), expiresAt.getTime());
});

test('a part renewed after the cleanup scan cannot be claimed for deletion', async () => {
    const { memory, db, intent } = checkpointFixture();
    intent.expiresAt = new Date(0);
    const rows = memory.collection(EXPORT_OBJECT_WRITES);
    const findOneAndUpdate = rows.findOneAndUpdate.bind(rows);
    Object.assign(rows, { findOneAndUpdate: async (...args: Parameters<typeof findOneAndUpdate>) => {
        intent.expiresAt = new Date(Date.now() + 86_400_000);
        return findOneAndUpdate(...args);
    } });
    assert.equal(await cleanupExportObjectWrites(db, 10, async () => { assert.fail('Renewed parts must not be deleted'); }), 0);
    assert.equal(intent.state, 'ready');
    assert.equal(rows.values.length, 1);
});

test('an archive renewed after the cleanup scan does not receive a permanent cleanup fence', async () => {
    const { memory, db, job } = fixture({ status: 'completed', archiveExpiresAt: new Date(0) });
    const rows = memory.collection('export_jobs');
    const updateOne = rows.updateOne.bind(rows);
    Object.assign(rows, { updateOne: async (...args: Parameters<typeof updateOne>) => {
        job.archiveExpiresAt = new Date(Date.now() + 86_400_000);
        return updateOne(...args);
    } });
    assert.deepEqual(await cleanupExpiredExports(10, { db, removePrefix: async () => {
        assert.fail('Renewed archives must not be deleted');
    } }), { checked: 1, cleaned: 0 });
    assert.equal(job.cleanupPending, undefined);
    assert.equal(job.abortedAt, undefined);
    assert.equal(job.status, 'completed');
});

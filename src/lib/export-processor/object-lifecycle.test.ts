import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { MemoryBillingDatabase, userFixture } from '@/lib/stripe/test-support';
import { getBillingAccount, ledgerKey } from '@/lib/stripe/ledger';
import { beginExportJobAttempt, updateActiveExportJob } from '@/lib/db/export-jobs';
import { beginExportObjectWrite, cleanupExportObjectWrites, completeExportObjectWrite, confirmExportJobAdmission, EXPORT_OBJECT_WRITES, revokeExportObjects } from './object-lifecycle';

function fixture() {
    const memory = new MemoryBillingDatabase();
    const jobId = new ObjectId();
    memory.collection('users').values.push(userFixture() as unknown as Record<string, unknown>);
    memory.collection('export_jobs').values.push({ _id: jobId, authSubject: 'owner', status: 'processing' });
    for (const name of ['export_jobs', EXPORT_OBJECT_WRITES]) {
        const rows = memory.collection(name);
        Object.assign(rows, {
            updateMany: async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
                let modifiedCount = 0;
                for (const row of [...rows.values]) modifiedCount += (await rows.updateOne({ ...filter, _id: row._id }, update)).modifiedCount;
                return { modifiedCount };
            },
            deleteOne: async (filter: Record<string, unknown>) => {
                const found = await rows.findOne(filter);
                if (!found) return { deletedCount: 0 };
                rows.values.splice(rows.values.findIndex(row => String(row._id) === String(found._id)), 1);
                return { deletedCount: 1 };
            },
        });
    }
    return { memory, db: memory.asDb(), jobId: jobId.toString(), key: `exports/owner/${jobId}/part-1.zip` };
}

test('revoking during PUT blocks publication and preserves cleanup after identity/job erasure', async () => {
    const { memory, db, jobId, key } = fixture();
    const intent = await beginExportObjectWrite('owner', jobId, key, db);
    assert.equal(memory.collection(EXPORT_OBJECT_WRITES).values.length, 1);
    assert.deepEqual(await revokeExportObjects('owner', db), [key]);
    assert.equal(await completeExportObjectWrite(intent, db), false);
    await assert.rejects(updateActiveExportJob(jobId, 'owner', { status: 'completed' }, db), /cancelled/);
    memory.collection('users').values = [];
    memory.collection('export_jobs').values = [];
    const removed: string[] = [];
    assert.equal(await cleanupExportObjectWrites(db, 10, async key => { removed.push(key); }), 0);
    // The late external PUT can finish during its lease; its durable key remains.
    memory.collection(EXPORT_OBJECT_WRITES).values[0].leaseUntil = new Date(0);
    assert.equal(await cleanupExportObjectWrites(db, 10, async key => { removed.push(key); }), 1);
    assert.deepEqual(removed, [key]);
    assert.equal(memory.collection(EXPORT_OBJECT_WRITES).values.length, 0);
});

test('a writer inserted after revocation is fenced before PUT and queued for cleanup', async () => {
    const { memory, db, jobId, key } = fixture();
    await revokeExportObjects('owner', db);
    await assert.rejects(beginExportObjectWrite('owner', jobId, key, db), /cancelled/);
    assert.equal(memory.collection(EXPORT_OBJECT_WRITES).values[0].state, 'pending');
});

test('failed storage cleanup preserves the receipt for retry and active writes cannot be replaced', async () => {
    const { memory, db, jobId, key } = fixture();
    const intent = await beginExportObjectWrite('owner', jobId, key, db);
    await assert.rejects(beginExportObjectWrite('owner', jobId, key, db), /duplicate/);
    assert.equal(await completeExportObjectWrite(intent, db), true);
    await revokeExportObjects('owner', db);
    memory.collection(EXPORT_OBJECT_WRITES).values[0].leaseUntil = new Date(0);
    await assert.rejects(cleanupExportObjectWrites(db, 10, async () => { throw new Error('R2 unavailable'); }), /R2 unavailable/);
    assert.equal(memory.collection(EXPORT_OBJECT_WRITES).values.length, 1);
    assert.equal(await cleanupExportObjectWrites(db, 10, async () => {}), 1);
});

test('revocation releases queued archive budgets and settles started/crashed archives before erasure', async () => {
    const { memory, db } = fixture();
    const account = getBillingAccount({});
    const lot = ledgerKey('base');
    account.recognizedRevenueMicros = 1000; account.reservedCostMicros = 200;
    account.fundingLots[lot] = { id: 'base', reference: 'invoice', source: 'stripe', kind: 'base', amountMicros: 1000, creditedMicros: 0, costMicros: 0, reservedCostMicros: 200, createdAt: new Date() };
    for (const id of ['queued', 'started']) account.reservations[ledgerKey(id)] = { id, kind: 'export', maximumCostMicros: 100, retailMicros: 0,
        allocations: { [lot]: 100 }, state: 'reserved', createdAt: new Date(), expiresAt: new Date() };
    memory.user().billingAccount = account;
    const jobs = memory.collection('export_jobs').values;
    Object.assign(jobs[0], { costReservationId: 'queued', maximumCostMicros: 100 });
    jobs.push({ _id: new ObjectId(), authSubject: 'owner', status: 'processing', costReservationId: 'started', maximumCostMicros: 100, costStartedAt: new Date() });
    await revokeExportObjects('owner', db);
    const result = getBillingAccount(memory.user());
    assert.equal(result.reservations[ledgerKey('queued')].state, 'released');
    assert.equal(result.reservations[ledgerKey('started')].state, 'settled');
    assert.equal(result.recognizedCostMicros, 100);
    assert.equal(result.reservedCostMicros, 0);
    assert.ok(jobs.every(job => job.costSettledAt instanceof Date));
});

test('a crashed archive cannot trigger unlimited generation attempts under one cost reservation', async () => {
    const { memory, db, jobId } = fixture();
    await beginExportJobAttempt(jobId, 'owner', db);
    await beginExportJobAttempt(jobId, 'owner', db);
    await assert.rejects(beginExportJobAttempt(jobId, 'owner', db), /single recovery attempt/);
    assert.equal(memory.collection('export_jobs').values[0].generationAttempts, 2);
});

test('creating a job after an account purge claim cannot admit later archive work', async () => {
    const { memory, db } = fixture();
    memory.user().billingRecovery = { startedAt: new Date(), purgeAt: new Date(), purgingAt: new Date(), warnings: [] };
    const job = await db.collection<import('@/lib/db/types').ExportJob>('export_jobs').findOne({});
    assert.ok(job);
    await assert.rejects(confirmExportJobAdmission(job, db), /cancelled/);
    assert.equal(memory.collection('export_jobs').values[0].cleanupPending, true);
    assert.ok(memory.collection('export_jobs').values[0].abortedAt instanceof Date);
});

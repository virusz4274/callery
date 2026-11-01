import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { ObjectId } from 'mongodb';
import { MemoryBillingDatabase, userFixture } from '@/lib/stripe/test-support';
import { createExportJob } from '@/lib/db/export-jobs';
import type { User } from '@/lib/db/types';

type State = {
    customer: Record<string, unknown>[]; operator: Record<string, unknown>[];
    settlements: Record<string, unknown>[]; economicsReads: number;
};
const key = Symbol.for('vosift.test.export-funding');
const shared = globalThis as typeof globalThis & { [key]: State };
const s = `globalThis[Symbol.for('vosift.test.export-funding')]`;
const policy = { version: 'export-funding-test', exports: { fixedMicros: 100, perGiBMicros: 100,
    maximumSourceBytes: 1024 ** 4, recoveryReserveMicros: 10_000 }, expiresAt: '2099-01-01' };
const hook = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/export-processor/policy.ts')) {
        const source = specifier === '@/lib/config' ? `export function billingEnabled(){return true;}`
            : specifier === '@/lib/stripe/economics' ? `export function assertManagedEconomicsReady(){${s}.economicsReads++;return ${JSON.stringify(policy)};} export function getManagedCostPolicy(){return ${JSON.stringify(policy)};}`
            : specifier === '@/lib/stripe/ledger' ? `export async function ensurePaidBaseForNewWork(user){return user;} export async function settlePrepaidReservation(subject,id,input){${s}.settlements.push({kind:'customer',id,...input});} export async function releasePrepaidReservation(subject,id){${s}.settlements.push({kind:'release-customer',id});}`
            : specifier === '@/lib/stripe/legacy-operator-costs' ? `export async function settleOperatorCost(subject,id,input){${s}.settlements.push({kind:'operator',id,...input});} export async function releaseOperatorCost(subject,id){${s}.settlements.push({kind:'release-operator',id});}`
            : undefined;
        if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    return next(specifier, context);
} });
const { assertFreshExportWindow, reserveExportBudget, finishExportBudget, exportBudgetFields, linkRecoveryExportBudget, getRecoveryExport, withExportRequestLease } = await import('./policy');
hook.deregister();
const snapshot = { revision: 'immutable-source', bytes: 100, estimatedArchiveBytes: 1024 ** 3, count: 1 };

function setup(source: 'trial' | 'grant' | 'internal' | 'customer' | 'recovery') {
    shared[key] = { customer: [], operator: [], settlements: [], economicsReads: 0 };
    const memory = new MemoryBillingDatabase(), db = memory.asDb();
    const user = userFixture({ planKey: source === 'internal' ? 'internal' : source === 'grant' ? 'custom' : source === 'trial' ? 'free-trial' : 'standard',
        ...(source === 'trial' ? { trialEndsAt: new Date(Date.now() + 30 * 86400_000) } : {}),
        billingEntitlement: { source: source === 'trial' ? 'trial' : ['grant', 'internal'].includes(source) ? 'admin' : 'subscription', grantedAt: new Date() },
        ...(source === 'recovery' ? { billingRecovery: { startedAt: new Date(), purgeAt: new Date(Date.now() + 30 * 86400_000), warnings: [] } } : {}) });
    memory.collection('users').values.push(user as unknown as Record<string, unknown>);
    return { memory, db, user, state: shared[key] };
}

test('managed exports use entitlement and physical limits without monetary admission', async () => {
    for (const mode of ['customer', 'trial', 'grant', 'internal'] as const) {
        const { db, user, state, memory } = setup(mode);
        const budget = await reserveExportBudget('owner', snapshot, db);
        assert.equal(budget?.version, 2);
        assert.equal(budget?.source, mode);
        assert.equal(budget?.maximumCostMicros, undefined);
        assert.equal(state.customer.length, 0);
        assert.equal(state.operator.length, 0);
        assert.equal(state.economicsReads, 0);
        await finishExportBudget('owner', budget!, true, db);
        assert.equal(state.settlements.length, 0);
        assert.equal(user.billingAccount, undefined);
        assert.equal(memory.collection('export_recovery_pools').values.length, 0);
        await assert.rejects(reserveExportBudget('owner', { ...snapshot, estimatedArchiveBytes: 2 * 1024 ** 4 + 1 }, db), /supported export size/);
    }
});

test('accepted legacy export holds still settle through their original financial path', async () => {
    const { db, state } = setup('customer');
    await finishExportBudget('owner', { id: 'legacy-export', source: 'customer', maximumCostMicros: 42 }, true, db);
    assert.deepEqual(state.settlements[0], { kind: 'customer', id: 'legacy-export', actualCostMicros: 42, chargedMicros: 0, outcome: 'completed', costBasis: 'committed_cap' });
});

test('expired or unpaid accounts await the single recovery archive instead of creating fresh daily exports', async () => {
    for (const mode of ['trial', 'customer'] as const) {
        const { db, memory } = setup(mode);
        const stored = memory.collection('users').values[0];
        if (mode === 'trial') stored.trialEndsAt = new Date(0);
        else stored.stripeSubscriptionStatus = 'past_due';
        await assert.rejects(reserveExportBudget('owner', snapshot, db), /recovery is being synchronized/);
        assert.equal(memory.collection('export_recovery_claims').values.length, 0);
    }
});

test('changing content does not mint another fresh export inside 24 hours', async () => {
    const { db, memory } = setup('customer'), now = new Date();
    memory.collection('export_jobs').values.push({ _id: new ObjectId(), authSubject: 'owner', status: 'completed',
        sourceRevision: 'old-content', createdAt: new Date(now.getTime() - 1000), costBudgetSource: 'customer' });
    await assert.rejects(assertFreshExportWindow('owner', db, now), /per 24 hours/);
    await assertFreshExportWindow('another-owner', db, now);
    await assertFreshExportWindow('owner', db, new Date(now.getTime() + 24 * 60 * 60_000));
});

test('recovery reservation resumes after a crash immediately after claim insertion', async () => {
    const { db, memory } = setup('recovery'), claims = memory.collection('export_recovery_claims');
    const update = claims.updateOne.bind(claims);
    let crash = true;
    Object.assign(claims, { updateOne: async (filter: Record<string, unknown>, patch: Record<string, unknown>, options?: { upsert?: boolean }) => {
        const result = await update(filter, patch, options);
        if (crash) { crash = false; throw new Error('Simulated process loss after claim'); }
        return result;
    } });
    await assert.rejects(reserveExportBudget('owner', snapshot, db), /process loss/);
    const budget = await reserveExportBudget('owner', snapshot, db);
    assert.equal(budget?.source, 'recovery');
    assert.equal(claims.values.length, 1);
    assert.equal(memory.collection('export_recovery_pools').values.length, 0);
});

test('recovery claim and deterministic job creation are idempotent after interruption', async () => {
    const { db, memory, state } = setup('recovery'), pools = memory.collection('export_recovery_pools');
    const budget = await reserveExportBudget('owner', snapshot, db);
    const data = { authSubject: 'owner', status: 'pending' as const, progress: 0, totalRecordings: 1, processedRecordings: 0,
        parts: [], checkpoint: { nextPartNumber: 1 }, sourceRevision: snapshot.revision, ...exportBudgetFields(budget) };
    const first = await createExportJob(data, db, new ObjectId(budget!.jobId));
    const retry = await createExportJob(data, db, new ObjectId(budget!.jobId));
    await linkRecoveryExportBudget('owner', budget, retry._id.toString(), db);
    assert.ok(first._id.equals(retry._id));
    assert.equal(memory.collection('export_jobs').values.length, 1);
    assert.equal(pools.values.length, 0);
    assert.equal(await getRecoveryExport('owner', db), first._id.toString());
    assert.equal(state.customer.length, 0);
    assert.equal(state.operator.length, 0);
    assert.equal((memory.user() as User).billingRecovery?.exportJobId, first._id.toString());
});

test('an unused recovery budget released before job insertion may resume the same admission', async () => {
    const { db, memory } = setup('recovery');
    const first = await reserveExportBudget('owner', snapshot, db);
    await finishExportBudget('owner', first!, false, db);
    assert.equal(memory.collection('export_recovery_pools').values.length, 0);
    const retry = await reserveExportBudget('owner', snapshot, db);
    assert.equal(retry!.id, first!.id);
    assert.equal(retry!.jobId, first!.jobId);
    assert.equal(memory.collection('export_recovery_pools').values.length, 0);
});

test('export request leases exclude concurrent preparation and fence a lost owner', async () => {
    const { db, memory } = setup('customer');
    await withExportRequestLease('owner', async (_database, assertOwned) => {
        await assertOwned();
        await assert.rejects(withExportRequestLease('owner', async () => {}, db), /Another export request/);
        const lease = memory.collection('export_request_leases').values[0];
        lease.owner = 'new-owner';
        await assert.rejects(assertOwned(), /lease expired/);
    }, db);
    assert.equal(memory.collection('export_request_leases').values[0].owner, 'new-owner');
});

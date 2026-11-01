import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBillingDatabase, userFixture } from '@/lib/stripe/test-support';
import { INTERNAL_STORAGE_EXPENSES, recordInternalStorageExpense } from './internal-storage-expenses';

test('Internal storage observations preserve 1 TiB access without a cost policy or customer ledger', async t => {
    const previous = process.env.MANAGED_COST_POLICY_JSON;
    delete process.env.MANAGED_COST_POLICY_JSON;
    t.after(() => { if (previous === undefined) delete process.env.MANAGED_COST_POLICY_JSON; else process.env.MANAGED_COST_POLICY_JSON = previous; });
    const memory = new MemoryBillingDatabase(), user = userFixture({ planKey: 'internal', storageAllocation: 1024 ** 4,
        storageUsed: 1024 ** 3, billingEntitlement: { source: 'admin', grantedAt: new Date() } });
    await recordInternalStorageExpense(user, memory.asDb(), new Date('2026-10-22'));
    user.storageUsed = 512 * 1024 ** 2;
    await recordInternalStorageExpense(user, memory.asDb(), new Date('2026-10-23'));
    const row = memory.collection(INTERNAL_STORAGE_EXPENSES).values[0];
    assert.equal(row.observedPeakBytes, 1024 ** 3);
    assert.equal(row.retainedBytes, 512 * 1024 ** 2);
    assert.equal(row.costBasis, 'unpriced');
    assert.equal(row.actualCostMicros, undefined);
    assert.equal(row.observationCount, 2);
    assert.equal(user.storageAllocation, 1024 ** 4);
    assert.equal(user.billingAccount, undefined);
    assert.equal(memory.collection('billing_operator_budget').values.length, 0);
});

test('monthly Internal storage observations ignore stale cost tables and never invent charges', async t => {
    const previous = process.env.MANAGED_COST_POLICY_JSON;
    process.env.MANAGED_COST_POLICY_JSON = JSON.stringify({ version: 'expired-example', expiresAt: '2020-01-01',
        storageCostMicrosPerGiBMonth: 15_000, storageOperationsMicrosPerGiBMonth: 1000 });
    t.after(() => { if (previous === undefined) delete process.env.MANAGED_COST_POLICY_JSON; else process.env.MANAGED_COST_POLICY_JSON = previous; });
    const memory = new MemoryBillingDatabase(), user = userFixture({ planKey: 'internal', storageUsed: 2 * 1024 ** 3,
        billingEntitlement: { source: 'admin', grantedAt: new Date() } });
    await recordInternalStorageExpense(user, memory.asDb(), new Date('2026-10-31'));
    await recordInternalStorageExpense(user, memory.asDb(), new Date('2026-11-01'));
    const rows = memory.collection(INTERNAL_STORAGE_EXPENSES).values;
    assert.equal(rows.length, 2);
    for (const row of rows) {
        assert.equal(row.estimatedPeakMonthCostMicros, undefined);
        assert.equal(row.costPolicyVersion, undefined);
        assert.equal(row.estimateStale, true);
        assert.equal(row.actualCostMicros, undefined);
        assert.equal(row.actualEvidenceId, undefined);
    }
});

test('storage expense observations cannot turn another funding source into Internal', async () => {
    const memory = new MemoryBillingDatabase();
    for (const source of ['trial', 'subscription', 'lifetime'] as const) {
        await recordInternalStorageExpense(userFixture({ planKey: 'internal', billingEntitlement: { source, grantedAt: new Date() } }), memory.asDb());
    }
    await recordInternalStorageExpense(userFixture({ planKey: 'custom', billingEntitlement: { source: 'admin', grantedAt: new Date() } }), memory.asDb());
    assert.equal(memory.collection(INTERNAL_STORAGE_EXPENSES).values.length, 0);
});

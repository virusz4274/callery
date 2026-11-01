import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveManagedCostPolicy, getHistoricalManagedCostPolicy, managedCostPolicyFingerprint } from './cost-schedule';
import type { ManagedCostPolicy } from './economics';
import { MemoryBillingDatabase, userFixture } from './test-support';
import { getBillingAccount, ledgerKey, type CostReservation } from './ledger';
import { hasUnsettledProviderCosts, reconcilePendingProviderCosts, type ProviderCostEvidence } from './provider-costs';

const policy: ManagedCostPolicy = { version: 'archived-cost-v1', reviewedAt: '2000-01-01', expiresAt: '2001-01-01',
    paymentFeeBasisPoints: 0, paymentFixedMicros: 0, minimumTopupMicros: 5_000_000, recoveryReserveMicros: 1, lifetimeHostingReserveMicros: 1,
    infrastructureMicrosPerAudioMinute: 1, infrastructureMicrosPerGiB: 1, aiBundleMicrosPerAudioMinute: 1, aiBundleFixedMicros: 1,
    storageCostMicrosPerGiBMonth: 1, storageOperationsMicrosPerGiBMonth: 1,
    providers: { soniox: { fixedMicros: 1, costMicrosPerAudioMinute: 2 } }, ai: {},
    exports: { fixedMicros: 1, perGiBMicros: 1, maximumSourceBytes: 100, recoveryReserveMicros: 1 } };
test('full cost schedule is immutable under one version and canonical across key order', async () => {
    const memory = new MemoryBillingDatabase(), db = memory.asDb();
    const reordered = { ...policy, providers: { soniox: { costMicrosPerAudioMinute: 2, fixedMicros: 1 } } };
    assert.equal(managedCostPolicyFingerprint(policy), managedCostPolicyFingerprint(reordered));
    const archived = await archiveManagedCostPolicy(policy, db);
    assert.equal((await archiveManagedCostPolicy(reordered, db)).fingerprint, archived.fingerprint);
    await assert.rejects(archiveManagedCostPolicy({ ...policy, infrastructureMicrosPerGiB: 999 }, db), /different immutable schedule/);
    const historical = await getHistoricalManagedCostPolicy(policy.version, db);
    assert.equal(historical.policy.infrastructureMicrosPerGiB, 1);
    assert.equal(historical.policy.expiresAt, '2001-01-01'); // Historical expiry never substitutes today's costs.
    await assert.rejects(getHistoricalManagedCostPolicy('missing-history', db), /retain|Retain/);
    await archiveManagedCostPolicy({ ...policy, version: 'archived-cost-v2', infrastructureMicrosPerGiB: 999 }, db);
    assert.equal(memory.collection('billing_cost_schedules').values.length, 2);
});
test('unknown paid provider caps remain financially unresolved in hot history and permanent archives', async () => {
    const memory = new MemoryBillingDatabase(), db = memory.asDb(), user = userFixture();
    user.billingAccount = getBillingAccount({}); memory.collection('users').values.push(user as unknown as Record<string, unknown>);
    const row: CostReservation = { id: 'audio', kind: 'transcription', maximumCostMicros: 100, actualCostMicros: 100, retailMicros: 0,
        expiresAt: new Date(), createdAt: new Date(), allocations: {}, state: 'settled', costBasis: 'committed_cap' };
    user.billingAccount.reservations[ledgerKey(row.id)] = row;
    assert.equal(await hasUnsettledProviderCosts('owner', db), true);
    row.costBasis = 'provider_verified'; assert.equal(await hasUnsettledProviderCosts('owner', db), false);
    memory.collection('billing_financial_archive').values.push({ _id: 'archive', authSubject: 'owner', kind: 'reservation', data: { ...row, costBasis: 'committed_cap' } });
    assert.equal(await hasUnsettledProviderCosts('owner', db), true);
    memory.collection('billing_financial_archive').values.length = 0;
    memory.collection('billing_provider_cost_evidence').values.push({ _id: 'pending-evidence', subject: 'owner' });
    assert.equal(await hasUnsettledProviderCosts('owner', db), true);
});

test('a quarantined historical cost rotates without preventing another owner reconciliation', async () => {
    const memory = new MemoryBillingDatabase(), db = memory.asDb(), archived = await archiveManagedCostPolicy(policy, db);
    const bad = userFixture({ authSubject: 'owner-bad' }), good = userFixture({ authSubject: 'owner-good' });
    good.billingAccount = getBillingAccount({}); good.billingAccount.recognizedCostMicros = 100;
    good.billingAccount.fundingLots.base = { id: 'base', reference: 'invoice', source: 'stripe', kind: 'base', amountMicros: 10_000, creditedMicros: 0, costMicros: 100, reservedCostMicros: 0, createdAt: new Date() };
    good.billingAccount.reservations[ledgerKey('audio')] = { id: 'audio', kind: 'transcription', maximumCostMicros: 100, actualCostMicros: 100, retailMicros: 0,
        expiresAt: new Date(), createdAt: new Date(), allocations: { base: 100 }, costAllocations: { base: 100 }, state: 'settled', costBasis: 'committed_cap',
        costPolicyVersion: policy.version, costPolicyFingerprint: archived.fingerprint };
    memory.collection('users').values.push(bad as unknown as Record<string, unknown>, good as unknown as Record<string, unknown>);
    const evidence: ProviderCostEvidence = { id: 'good-evidence', receiptId: 'audio', subject: 'owner-good', provider: 'soniox', model: 'stt-async-v5',
        costPolicyVersion: policy.version, costMicros: 80, source: 'provider_usage_log', providerReference: 'provider-log', observedAt: new Date() };
    memory.collection('billing_provider_cost_evidence').values.push({ ...evidence, _id: ledgerKey('bad-evidence'), id: 'bad-evidence', subject: 'owner-bad', costPolicyVersion: 'missing-history' },
        { ...evidence, _id: ledgerKey(evidence.id) });
    const previous = process.env.MANAGED_COST_POLICY_JSON; process.env.MANAGED_COST_POLICY_JSON = 'invalid current environment must never replace accepted history';
    try {
        assert.equal(await reconcilePendingProviderCosts(db), 1);
        const rows = memory.collection('billing_provider_cost_evidence').values;
        assert.equal(rows[0].state, 'review'); assert.ok(rows[0].lastCheckedAt instanceof Date); assert.equal(rows[0].appliedAt, undefined);
        assert.equal(rows[1].state, 'applied'); assert.ok(rows[1].appliedAt instanceof Date);
        assert.equal(memory.collection('users').values[0].billingReview, undefined);
        assert.equal(await hasUnsettledProviderCosts('owner-bad', db), true); assert.equal(await hasUnsettledProviderCosts('owner-good', db), false);
    } finally { if (previous === undefined) delete process.env.MANAGED_COST_POLICY_JSON; else process.env.MANAGED_COST_POLICY_JSON = previous; }
});

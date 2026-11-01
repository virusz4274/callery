import test from 'node:test';
import assert from 'node:assert/strict';
import { applyProviderCostEvidence, hasLegacyProviderCostWork, hasUnsettledProviderCosts, providerUsdToMicros, reconcileSonioxCosts, type ProviderCostEvidence } from './provider-costs';
import { getBillingAccount, ledgerKey, reserveCost } from './ledger';
import { MemoryBillingDatabase, userFixture } from './test-support';

test('new execution-policy recordings never activate legacy provider-cost reconciliation or create scan journals', async () => {
    const memory = new MemoryBillingDatabase(), db = memory.asDb();
    memory.collection('billing_provider_attempts').values.push(
        { _id: 'new', provider: 'soniox', receipt: { id: 'new', executionPolicy: { version: 1 }, accountingMode: 'retail_only' } },
        { _id: 'mixed', provider: 'soniox', receipt: { id: 'mixed', executionPolicy: { version: 1 }, costPolicyVersion: 'historical_metadata' } },
        { _id: 'retail', provider: 'soniox', receipt: { id: 'retail', accountingMode: 'retail_only', costPolicyVersion: 'historical_metadata' } },
    );
    assert.equal(await hasLegacyProviderCostWork(db), false);
    let calls = 0;
    const fetcher = (async () => { calls++; throw new Error('New jobs must not read provider cost APIs.'); }) as typeof fetch;
    assert.deepEqual(await reconcileSonioxCosts(db, fetcher), { verified: 0, pending: 0 });
    assert.equal(calls, 0); assert.equal(memory.collection('billing_provider_cost_scans').values.length, 0);
});

test('unresolved actual legacy cost evidence remains recoverable and settled history stops new provider scans', async () => {
    const memory = new MemoryBillingDatabase(), db = memory.asDb();
    const attempts = memory.collection('billing_provider_attempts');
    attempts.values.push({ _id: 'legacy', provider: 'soniox', receipt: { id: 'legacy', costPolicyVersion: 'accepted-history' } });
    assert.equal(await hasLegacyProviderCostWork(db), true); assert.equal(await hasLegacyProviderCostWork(db, 'soniox'), true);
    assert.equal(await hasLegacyProviderCostWork(db, 'elevenlabs'), false);
    const evidence = memory.collection('billing_provider_cost_evidence');
    evidence.values.push({ _id: 'actual', receiptId: 'legacy', provider: 'soniox', appliedAt: new Date() });
    assert.equal(await hasLegacyProviderCostWork(db), false);
    evidence.values.push({ _id: 'unresolved', receiptId: 'erased-legacy', provider: 'soniox', state: 'review' });
    assert.equal(await hasLegacyProviderCostWork(db), true); assert.equal(evidence.values.length, 2);
});

test('mixed Soniox log pages ignore new retail recordings and retain genuine legacy model discrepancies', async () => {
    const memory = new MemoryBillingDatabase(), db = memory.asDb();
    const newer = 'transcription-v2:owner:new:attempt', older = 'transcription-v2:owner:old:attempt';
    memory.collection('billing_provider_attempts').values.push(
        { _id: ledgerKey(newer), provider: 'soniox', authSubject: 'owner', receipt: { id: newer, model: 'stt-async-v5', executionPolicy: { version: 1 }, accountingMode: 'retail_only' } },
        { _id: ledgerKey(older), provider: 'soniox', authSubject: 'owner', receipt: { id: older, model: 'stt-async-v5', costPolicyVersion: 'accepted-history' } },
    );
    let calls = 0;
    const fetcher = (async () => {
        calls++;
        return Response.json({ usage_logs: [
            { uuid: 'new-log', client_reference_id: newer, model: 'stt-async-v5', cost_usd: '0.01' },
            { uuid: 'old-log', client_reference_id: older, model: 'different-model', cost_usd: '0.01' },
        ] });
    }) as typeof fetch;
    assert.deepEqual(await reconcileSonioxCosts(db, fetcher), { verified: 0, pending: 1 });
    assert.equal(calls, 1); assert.equal(memory.collection('billing_provider_cost_evidence').values.length, 0);
    assert.equal(memory.collection('billing_provider_attempts').values.length, 2);
});

test('provider cost evidence replaces committed cap once and trips a durable admission circuit on overruns', () => {
    const account = getBillingAccount({}), id = 'receipt', key = ledgerKey(id);
    account.recognizedCostMicros = 100;
    account.reservations[key] = { id, kind: 'transcription', maximumCostMicros: 100, actualCostMicros: 100, retailMicros: 10_000, chargedMicros: 10_000,
        allocations: {}, costAllocations: {}, usageCostBudgetMicros: 5000, state: 'settled', createdAt: new Date(), expiresAt: new Date(), costBasis: 'committed_cap' };
    const evidence: ProviderCostEvidence = { id: 'provider:usage', subject: 'owner', receiptId: id, provider: 'soniox', model: 'stt-async-v5',
        costPolicyVersion: 'audited', costMicros: 80, source: 'provider_usage_log', providerReference: 'log', observedAt: new Date() };
    assert.equal(applyProviderCostEvidence(account, evidence), true); assert.equal(account.recognizedCostMicros, 80);
    assert.equal(applyProviderCostEvidence(account, evidence), false); assert.equal(account.recognizedCostMicros, 80);
    assert.equal(account.reservations[key].costBasis, 'provider_verified');
    assert.throws(() => applyProviderCostEvidence(account, { ...evidence, costMicros: 90 }), /conflicts/);
    account.reservations[key].costEvidenceId = undefined;
    applyProviderCostEvidence(account, { ...evidence, id: 'overrun', costMicros: 120 });
    assert.equal(account.recognizedCostMicros, 120); assert.equal(account.costReview?.reason, 'provider_cost_exceeded_accepted_cap');
    account.reservations[key].costEvidenceId = undefined;
    account.costReview = { reason: 'prepaid_payment_reversed', evidenceId: 'dispute', at: new Date() };
    applyProviderCostEvidence(account, { ...evidence, id: 'later-overrun', costMicros: 130 });
    assert.equal(account.costReview.reason, 'prepaid_payment_reversed');
});
test('actual provider USD parsing never rounds an incurred fractional microdollar down', () => {
    assert.equal(providerUsdToMicros('0.0081000000'), 8100); assert.equal(providerUsdToMicros('0.0000000001'), 1);
    assert.throws(() => providerUsdToMicros('-1'), /Invalid/);
});

test('verified costs use all earned usage revenue without imposing a margin or charging the wallet again', () => {
    const account = getBillingAccount({}), id = 'earned-cost', key = ledgerKey(id);
    account.prepaidSpentMicros = 10_000; account.recognizedRevenueMicros = 10_000; account.recognizedCostMicros = 8000;
    account.usageFunding = { recurring: { revenueMicros: 10_000, costMicros: 8000, reservedCostMicros: 0 },
        lifetime: { revenueMicros: 0, costMicros: 0, reservedCostMicros: 0 } };
    account.reservations[key] = { id, kind: 'transcription', maximumCostMicros: 9000, actualCostMicros: 8000,
        retailMicros: 10_000, chargedMicros: 10_000, allocations: {}, costAllocations: {}, usageCostBudgetMicros: 8000,
        state: 'settled', createdAt: new Date(), expiresAt: new Date(), costBasis: 'committed_cap' };
    applyProviderCostEvidence(account, { id: 'actual-earned', subject: 'owner', receiptId: id, provider: 'soniox', model: 'stt-async-v5',
        costPolicyVersion: 'audited', costMicros: 9000, source: 'provider_usage_log', providerReference: 'log', observedAt: new Date() });
    assert.equal(account.usageFunding.recurring.costMicros, 9000);
    assert.equal(account.reservations[key].unfundedCostMicros, undefined);
    assert.equal(account.recognizedCostMicros, 9000);
    assert.equal(account.prepaidSpentMicros, 10_000);
    assert.equal(account.costReview, undefined);
});

test('later provider evidence allocates costs against full retained principal and preserves fee accounting', () => {
    const account = getBillingAccount({}), id = 'base-cost', key = ledgerKey(id);
    account.recognizedRevenueMicros = 10_000; account.recognizedCostMicros = 7100;
    account.fundingLots.base = { id: 'base', reference: 'paid', source: 'stripe', kind: 'base', amountMicros: 10_000,
        creditedMicros: 0, costMicros: 7100, processorFeeMicros: 100, reservedCostMicros: 0, createdAt: new Date() };
    account.reservations[key] = { id, kind: 'transcription', maximumCostMicros: 9000, actualCostMicros: 7000,
        retailMicros: 0, chargedMicros: 0, allocations: { base: 9000 }, costAllocations: { base: 7000 }, usageCostBudgetMicros: 0,
        state: 'settled', createdAt: new Date(), expiresAt: new Date(), costBasis: 'committed_cap' };
    applyProviderCostEvidence(account, { id: 'actual-base', subject: 'owner', receiptId: id, provider: 'soniox', model: 'stt-async-v5',
        costPolicyVersion: 'audited', costMicros: 8000, source: 'provider_usage_log', providerReference: 'log', observedAt: new Date() });
    assert.equal(account.fundingLots.base.costMicros, 8100);
    assert.equal(account.recognizedCostMicros, 8100);
    assert.equal(account.reservations[key].costAllocations!.base, 8000);
    assert.equal(account.reservations[key].unfundedCostMicros, undefined);
    assert.equal(account.costReview, undefined);
});

test('a successful committed cap is settled independently of measured evidence; unknown outcomes stay retained', async () => {
    const memory = new MemoryBillingDatabase(), account = getBillingAccount({}), id = 'known-embedding';
    account.reservations[ledgerKey(id)] = { id, kind: 'search:embedding', maximumCostMicros: 10, actualCostMicros: 10,
        retailMicros: 0, allocations: {}, state: 'settled', createdAt: new Date(), expiresAt: new Date(),
        outcome: 'completed', costBasis: 'committed_cap' };
    memory.collection('users').values.push(userFixture({ billingAccount: account }) as unknown as Record<string, unknown>);
    assert.equal(await hasUnsettledProviderCosts('owner', memory.asDb()), false);
    const row = memory.user().billingAccount!.reservations[ledgerKey(id)];
    row.outcome = 'unknown';
    assert.equal(await hasUnsettledProviderCosts('owner', memory.asDb()), true);
    row.outcome = 'completed';
    memory.collection('billing_financial_archive').values.push({ _id: 'archived-transcription', authSubject: 'owner', kind: 'reservation', data: { ...row, kind: 'transcription' } });
    assert.equal(await hasUnsettledProviderCosts('owner', memory.asDb()), false);
    (memory.collection('billing_financial_archive').values[0].data as Record<string, unknown>).outcome = 'unknown';
    assert.equal(await hasUnsettledProviderCosts('owner', memory.asDb()), true);
    assert.equal(row.costEvidenceId, undefined);
    assert.equal(memory.collection('billing_provider_cost_evidence').values.length, 0);
});

test('a within-cap authoritative correction retains unfunded expense and pauses new work after released capacity was reused', () => {
    const account = getBillingAccount({}), id = 'corrected-within-cap', key = ledgerKey(id);
    account.prepaidSpentMicros = 100; account.recognizedRevenueMicros = 100; account.recognizedCostMicros = 50; account.reservedCostMicros = 50;
    account.usageFunding = { recurring: { revenueMicros: 100, costMicros: 50, reservedCostMicros: 50 },
        lifetime: { revenueMicros: 0, costMicros: 0, reservedCostMicros: 0 } };
    account.reservations[key] = { id, kind: 'transcription', maximumCostMicros: 100, actualCostMicros: 50,
        retailMicros: 100, chargedMicros: 100, allocations: {}, costAllocations: {}, usageCostBudgetMicros: 50,
        state: 'settled', createdAt: new Date(), expiresAt: new Date(), costBasis: 'committed_cap', outcome: 'completed' };
    const evidence: ProviderCostEvidence = { id: 'actual-correction', subject: 'owner', receiptId: id, provider: 'soniox', model: 'stt-async-v5',
        costPolicyVersion: 'audited', costMicros: 80, source: 'provider_usage_log', providerReference: 'log-correction', observedAt: new Date() };
    assert.equal(applyProviderCostEvidence(account, evidence), true);
    assert.equal(account.recognizedCostMicros, 80); assert.equal(account.prepaidSpentMicros, 100);
    assert.equal(account.reservations[key].unfundedCostMicros, 30);
    assert.equal(account.reservations[key].outcome, 'completed'); assert.equal(account.reservations[key].costBasis, 'provider_verified');
    assert.equal(account.costReview?.reason, 'verified_provider_cost_requires_operating_funding');
    assert.throws(() => reserveCost(account, userFixture(), { id: 'blocked-next-work', kind: 'transcription', maximumCostMicros: 1,
        retailMicros: 0, expiresAt: new Date() }), /spending is paused/);
    assert.equal(applyProviderCostEvidence(account, evidence), false);
    assert.equal(account.recognizedCostMicros, 80, 'The authoritative incurred expense is recorded only once');
});

test('corrected Lifetime costs can use already-earned recurring revenue without changing its provenance', () => {
    const account = getBillingAccount({}), id = 'cross-family-evidence', key = ledgerKey(id);
    account.prepaidSpentMicros = 100; account.recognizedRevenueMicros = 100; account.recognizedCostMicros = 40;
    account.usageFunding = { recurring: { revenueMicros: 100, costMicros: 0, reservedCostMicros: 0 },
        lifetime: { revenueMicros: 0, costMicros: 40, reservedCostMicros: 0 } };
    account.reservations[key] = { id, kind: 'transcription', usageTier: 'lifetime', maximumCostMicros: 100, actualCostMicros: 40,
        retailMicros: 0, chargedMicros: 0, allocations: {}, costAllocations: {}, usageCostBudgetMicros: 40,
        state: 'settled', createdAt: new Date(), expiresAt: new Date(), costBasis: 'committed_cap', outcome: 'completed' };
    applyProviderCostEvidence(account, { id: 'cross-family-actual', subject: 'owner', receiptId: id, provider: 'soniox', model: 'stt-async-v5',
        costPolicyVersion: 'audited', costMicros: 80, source: 'provider_usage_log', providerReference: 'cross-family-log', observedAt: new Date() });
    assert.equal(account.usageFunding.recurring.revenueMicros, 100); assert.equal(account.usageFunding.lifetime.revenueMicros, 0);
    assert.equal(account.usageFunding.recurring.costMicros, 0); assert.equal(account.usageFunding.lifetime.costMicros, 80);
    assert.equal(account.reservations[key].unfundedCostMicros, undefined); assert.equal(account.costReview, undefined);
    assert.equal(account.prepaidSpentMicros, 100); assert.equal(account.recognizedRevenueMicros, 100);
});

test('a preexisting aggregate funding deficit cannot become available cash during a downward provider correction', () => {
    const account = getBillingAccount({}), id = 'deficit-correction', key = ledgerKey(id);
    account.prepaidSpentMicros = 100; account.recognizedRevenueMicros = 100; account.recognizedCostMicros = 150;
    account.usageFunding = { recurring: { revenueMicros: 100, costMicros: 70, reservedCostMicros: 0 },
        lifetime: { revenueMicros: 0, costMicros: 80, reservedCostMicros: 0 } };
    account.reservations[key] = { id, kind: 'transcription', usageTier: 'lifetime', maximumCostMicros: 100, actualCostMicros: 80,
        retailMicros: 0, chargedMicros: 0, allocations: {}, costAllocations: {}, usageCostBudgetMicros: 80,
        state: 'settled', createdAt: new Date(), expiresAt: new Date(), costBasis: 'committed_cap', outcome: 'completed' };
    applyProviderCostEvidence(account, { id: 'deficit-actual', subject: 'owner', receiptId: id, provider: 'soniox', model: 'stt-async-v5',
        costPolicyVersion: 'audited', costMicros: 40, source: 'provider_usage_log', providerReference: 'deficit-log', observedAt: new Date() });
    assert.equal(account.recognizedCostMicros, 110); assert.equal(account.usageFunding.lifetime.costMicros, 30);
    assert.equal(account.reservations[key].unfundedCostMicros, 10);
    assert.equal(account.costReview?.reason, 'verified_provider_cost_requires_operating_funding');
    assert.equal(account.recognizedRevenueMicros, 100);
});

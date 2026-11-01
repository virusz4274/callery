import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBillingDatabase, userFixture } from './test-support';
import { getBillingAccount } from './ledger';
import { acceptExecutionCall, closeExecutionPolicy, getExecutionPolicy, prepareExecutionPolicy, recordExecutionOutcome, type ExecutionPolicySnapshot } from './execution-policy';
import { defaultTranscriptEnvelope } from '@/lib/transcription/ai-work-plan';
import { ProcessingPausedError } from '@/lib/processing-availability';

async function fixture() {
    const memory = new MemoryBillingDatabase();
    await memory.collection('users').insertOne(userFixture({ billingAccount: getBillingAccount({}) }) as never);
    const model = { provider: 'gemini', model: 'test' };
    const policy: ExecutionPolicySnapshot = { version: 1, id: 'accepted-work', parentReceiptId: 'accepted-work', fundingSource: 'trial', provider: 'soniox', model: 'stt-async-v5',
        aiModels: { summary: model, transliteration: model, embedding: model }, transcriptEnvelope: defaultTranscriptEnvelope(30), promptVersion: 'pinned-prompt', maximumAttempts: 2, acceptedAt: new Date().toISOString() };
    await prepareExecutionPolicy('owner', policy, memory.asDb());
    return { memory, db: memory.asDb(), policy };
}

test('execution policy pins limits and identity without money, costs or customer funding', async () => {
    const { db, policy, memory } = await fixture();
    assert.deepEqual(await prepareExecutionPolicy('owner', { ...policy, acceptedAt: new Date().toISOString() }, db), policy);
    await assert.rejects(prepareExecutionPolicy('owner', { ...policy, model: 'replacement' }, db), /execution policy changed/);
    assert.equal('totalCostMicros' in (await getExecutionPolicy('owner', policy.id, db))!, false);
    await acceptExecutionCall('owner', policy.id, 'summary-1', 'request-hash', db);
    await acceptExecutionCall('owner', policy.id, 'summary-1', 'request-hash', db);
    assert.equal(Object.keys(memory.user().billingAccount!.reservations).length, 0);
    const call = Object.values(memory.collection('processing_execution_policies').values[0].calls as Record<string, { acceptedAt?: Date }>)[0];
    assert.ok(call.acceptedAt instanceof Date);
    await assert.rejects(acceptExecutionCall('owner', policy.id, 'summary-1', 'changed-request', db), /already completed or requires outcome review/);
});
test('unknown submitted call is retained and cannot automatically start or close again', async () => {
    const { db, policy } = await fixture();
    await acceptExecutionCall('owner', policy.id, 'summary-1', 'request-hash', db);
    await recordExecutionOutcome('owner', policy.id, 'summary-1', 'unknown', db);
    await assert.rejects(acceptExecutionCall('owner', policy.id, 'summary-1', 'request-hash', db), /outcome review/);
    await assert.rejects(closeExecutionPolicy('owner', policy.id, db), /Uncertain provider calls/);
    await recordExecutionOutcome('owner', policy.id, 'summary-1', 'completed', db);
    await closeExecutionPolicy('owner', policy.id, db);
    await closeExecutionPolicy('owner', policy.id, db);
});
test('manual pause blocks unstarted work but a durably saved response can complete', async () => {
    const { db, policy, memory } = await fixture();
    await acceptExecutionCall('owner', policy.id, 'summary-1', 'request-hash', db);
    await memory.collection('system_settings').insertOne({ _id: 'singleton', processingPaused: true });
    await assert.rejects(acceptExecutionCall('owner', policy.id, 'embedding-1', 'embedding-hash', db), ProcessingPausedError);
    await recordExecutionOutcome('owner', policy.id, 'summary-1', 'completed', db);
    await closeExecutionPolicy('owner', policy.id, db);
});
test('expense-only legacy reviews are ignored, payment and deletion fences remain', async () => {
    const { db, policy, memory } = await fixture();
    memory.user().billingAccount!.costReview = { reason: 'verified_provider_cost_requires_operating_funding', evidenceId: 'old-expense', at: new Date() };
    await acceptExecutionCall('owner', policy.id, 'summary-1', 'request-hash', db);
    memory.user().billingAccount!.costReview = { reason: 'unresolved_payment_reversal', evidenceId: 'payment', at: new Date() };
    await assert.rejects(acceptExecutionCall('owner', policy.id, 'embedding-1', 'hash', db), /cannot start/);
    delete memory.user().billingAccount!.costReview; memory.user().disabled = true;
    await assert.rejects(acceptExecutionCall('owner', policy.id, 'embedding-1', 'hash', db), /cannot start/);
});

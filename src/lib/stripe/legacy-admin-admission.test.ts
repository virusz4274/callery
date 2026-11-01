import test from 'node:test';
import assert from 'node:assert/strict';
import { checkTranscriptionAccess } from '@/lib/access-control';
import { createTranscriptionReceipt, releaseTranscriptionReservation, settleCanonicalTranscription, settleRemovedRecording } from './transcription-receipt';
import { MemoryBillingDatabase, userFixture } from './test-support';
import { getExecutionPolicy } from './execution-policy';
import { getBillingAccount, ledgerKey } from './ledger';
import type { User } from '@/lib/db/types';

function internalUser(overrides: Partial<User> = {}): User {
    return userFixture({ role: 'user', planKey: 'internal', billingEntitlement: { source: 'admin', grantedAt: new Date() },
        stripeCustomerId: undefined, stripeSubscriptionId: undefined, stripeSubscriptionStatus: undefined,
        transcriptionAllocation: 60_000, transcriptionUsed: 0, ...overrides });
}
async function managed(work: () => Promise<void>) {
    const previousPolicy = process.env.MANAGED_COST_POLICY_JSON, previousBilling = process.env.NEXT_PUBLIC_ENABLE_BILLING;
    delete process.env.MANAGED_COST_POLICY_JSON; process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
    try { await work(); } finally {
        if (previousPolicy === undefined) delete process.env.MANAGED_COST_POLICY_JSON; else process.env.MANAGED_COST_POLICY_JSON = previousPolicy;
        if (previousBilling === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING; else process.env.NEXT_PUBLIC_ENABLE_BILLING = previousBilling;
    }
}

test('Internal belongs to an assigned ordinary user and accepts deduplicated processing without Stripe or expense journals', async () => managed(async () => {
    const memory = new MemoryBillingDatabase(), user = internalUser({ transcriptionUsed: 1_000_000 });
    await memory.collection('users').insertOne(user as never);
    assert.equal(checkTranscriptionAccess(user, 15).allowed, true);
    const receipt = await createTranscriptionReceipt(user, 'demo', 'attempt', 'gemini', 'gemini-3.5-transcribe', 15, 1024, memory.asDb());
    assert.equal(receipt.billing, null); assert.equal(receipt.operatorReservationId, undefined);
    assert.equal(receipt.executionPolicy?.fundingSource, 'internal'); assert.equal(receipt.consumedSeconds, 45);
    assert.deepEqual(await createTranscriptionReceipt(user, 'demo', 'attempt', 'gemini', 'gemini-3.5-transcribe', 15, 1024, memory.asDb()), receipt);
    assert.equal(memory.collection('billing_provider_attempts').values.length, 1);
    assert.equal(memory.collection('billing_internal_costs').values.length, 0);
    assert.equal(memory.collection('billing_operator_budget').values.length, 0);
    assert.equal(memory.user().stripeCustomerId, undefined);
    await settleCanonicalTranscription(user.authSubject, receipt, memory.asDb());
    await settleCanonicalTranscription(user.authSubject, receipt, memory.asDb());
    assert.equal(memory.user().transcriptionUsed, 1_000_045);
}));

test('unknown paid and Stripe-linked accounts cannot infer a free entitlement', async () => managed(async () => {
    for (const patch of [{ planKey: 'standard' }, { planKey: 'pro' }, { planKey: 'lifetime' }, { stripeSubscriptionId: 'sub_existing' }]) {
        const memory = new MemoryBillingDatabase(), user = internalUser({ billingEntitlement: undefined, ...patch });
        await memory.collection('users').insertOne(user as never);
        await assert.rejects(createTranscriptionReceipt(user, 'demo', 'attempt', 'soniox', 'stt-async-v5', 15, 1024, memory.asDb()), /Verified customer billing or an explicit operator-funded entitlement/);
        assert.equal(memory.collection('billing_provider_attempts').values.length, 0);
    }
}));

test('trial allowance is held atomically without a monetary cap and failed work releases it', async () => managed(async () => {
    const memory = new MemoryBillingDatabase(), user = userFixture({ transcriptionAllocation: 15, transcriptionUsed: 0, trialEndsAt: new Date('2099-01-01') });
    await memory.collection('users').insertOne(user as never);
    const attempts = await Promise.allSettled(['one', 'two'].map(id => createTranscriptionReceipt(user, id, 'attempt', 'soniox', 'stt-async-v5', 15, 1024, memory.asDb())));
    assert.equal(attempts.filter(row => row.status === 'fulfilled').length, 1);
    const receipt = attempts.find(row => row.status === 'fulfilled')!.value;
    await releaseTranscriptionReservation(user.authSubject, receipt, memory.asDb());
    assert.equal(memory.user().transcriptionUsed, 0);
    const retry = await createTranscriptionReceipt(user, 'three', 'attempt', 'soniox', 'stt-async-v5', 15, 1024, memory.asDb());
    await settleCanonicalTranscription(user.authSubject, retry, memory.asDb());
    assert.equal(memory.user().transcriptionUsed, 15);
    assert.equal(memory.collection('billing_operator_budget').values.length, 0);
}));

test('finite Custom assignment does not inherit Internal unlimited usage', async () => managed(async () => {
    const memory = new MemoryBillingDatabase(), user = internalUser({ planKey: 'custom', transcriptionAllocation: 15, transcriptionUsed: 15 });
    await memory.collection('users').insertOne(user as never);
    await assert.rejects(createTranscriptionReceipt(user, 'full', 'attempt', 'soniox', 'stt-async-v5', 15, 1024, memory.asDb()), /Included transcription quota is exhausted/);
}));

test('interrupted receipt metadata resumes its pinned execution policy without another allowance hold', async () => managed(async () => {
    const memory = new MemoryBillingDatabase(), user = internalUser(); await memory.collection('users').insertOne(user as never);
    const attempts = memory.collection('billing_provider_attempts'), update = attempts.updateOne.bind(attempts); let interrupted = false;
    attempts.updateOne = async (filter, patch, options) => {
        if (!interrupted) { interrupted = true; throw new Error('simulated metadata interruption'); }
        return update(filter, patch, options);
    };
    await assert.rejects(createTranscriptionReceipt(user, 'resume', 'attempt', 'soniox', 'stt-async-v5', 15, 1024, memory.asDb()), /simulated metadata interruption/);
    const id = `transcription-v2:${user.authSubject}:resume:attempt`, frozen = await getExecutionPolicy(user.authSubject, id, memory.asDb());
    const receipt = await createTranscriptionReceipt(user, 'resume', 'attempt', 'soniox', 'stt-async-v5', 15, 1024, memory.asDb());
    assert.deepEqual(receipt.executionPolicy, frozen);
    assert.equal(Object.keys(getBillingAccount(memory.user()).reservations).length, 1);
    assert.equal(attempts.values.length, 1);
}));

test('late success after content deletion settles quota once and closes its nonfinancial execution record', async () => managed(async () => {
    const memory = new MemoryBillingDatabase(), user = internalUser(); await memory.collection('users').insertOne(user as never);
    const receipt = await createTranscriptionReceipt(user, 'removed', 'attempt', 'soniox', 'stt-async-v5', 15, 1024, memory.asDb());
    assert.equal(await settleRemovedRecording(user.authSubject, 'removed', 'soniox', [], 'attempt', true, memory.asDb()), true);
    assert.equal(await settleRemovedRecording(user.authSubject, 'removed', 'soniox', [], 'attempt', true, memory.asDb()), true);
    assert.equal(memory.user().transcriptionUsed, 15);
    assert.equal(getBillingAccount(memory.user()).reservations[ledgerKey(receipt.id)].state, 'settled');
    assert.equal(memory.collection('processing_execution_policies').values[0].state, 'closed');
}));

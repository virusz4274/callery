import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import type { User } from '@/lib/db/types';
import { userFixture } from './test-support';
import { createTranscriptionReceipt, settleCanonicalTranscription } from './transcription-receipt';
import { getBillingAccount } from './ledger';
import { acceptExecutionCall, closeExecutionPolicy, prepareExecutionPolicy, recordExecutionOutcome } from './execution-policy';

test('retail-only processing and execution checkpoints are atomic on disposable Mongo without cost configuration', { skip: !process.env.VOSIFT_TEST_MONGODB_URI }, async t => {
    const client = new MongoClient(process.env.VOSIFT_TEST_MONGODB_URI!, { serverSelectionTimeoutMS: 15_000 });
    const db = client.db(`vt_exec_${randomUUID().replaceAll('-', '').slice(0, 16)}`);
    const prior = { policy: process.env.MANAGED_COST_POLICY_JSON, billing: process.env.NEXT_PUBLIC_ENABLE_BILLING };
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true'; delete process.env.MANAGED_COST_POLICY_JSON;
    let connected = false;
    try {
        await client.connect(); connected = true;
        await t.test('concurrent one-time trial jobs cannot both claim the same remaining allowance', async () => {
            const user = userFixture({ authSubject: 'owned-trial', transcriptionAllocation: 15, transcriptionUsed: 0, trialEndsAt: new Date(Date.now() + 30 * 86400_000) });
            await db.collection('users').insertOne(user);
            const outcomes = await Promise.allSettled(['a', 'b'].map(id => createTranscriptionReceipt(user, id, 'attempt', 'soniox', 'stt-async-v5', 15, 1000, db)));
            const accepted = outcomes.filter(row => row.status === 'fulfilled'); assert.equal(accepted.length, 1);
            const receipt = accepted[0].value;
            await Promise.all([settleCanonicalTranscription(user.authSubject, receipt, db), settleCanonicalTranscription(user.authSubject, receipt, db)]);
            const updated = await db.collection<User>('users').findOne({ authSubject: user.authSubject });
            assert.equal(updated?.transcriptionUsed, 15);
            assert.equal(await db.collection('billing_processing_budgets').countDocuments({}), 0);
            assert.equal(await db.collection('billing_operator_budget').countDocuments({}), 0);
        });
        await t.test('unknown provider outcome stays reviewable and completed response closes without expense funds', async () => {
            const user = userFixture({ authSubject: 'owned-internal', role: 'user', planKey: 'internal', transcriptionUsed: 100_000,
                billingEntitlement: { source: 'admin', grantedAt: new Date() }, stripeCustomerId: undefined });
            await db.collection('users').insertOne(user);
            const receipt = await createTranscriptionReceipt(user, 'internal', 'attempt', 'gemini', 'gemini-3.5-transcribe', 15, 1000, db);
            assert.ok(receipt.executionPolicy);
            assert.deepEqual(await prepareExecutionPolicy(user.authSubject, receipt.executionPolicy, db), receipt.executionPolicy);
            await acceptExecutionCall(user.authSubject, receipt.id, 'summary-1', 'pinned-hash', db);
            await recordExecutionOutcome(user.authSubject, receipt.id, 'summary-1', 'unknown', db);
            await assert.rejects(closeExecutionPolicy(user.authSubject, receipt.id, db), /Uncertain provider calls/);
            await recordExecutionOutcome(user.authSubject, receipt.id, 'summary-1', 'completed', db);
            await closeExecutionPolicy(user.authSubject, receipt.id, db);
            const saved = await db.collection<User>('users').findOne({ authSubject: user.authSubject });
            assert.equal(getBillingAccount(saved || {}).reservedCostMicros, 0);
            assert.equal(await db.collection('billing_internal_costs').countDocuments({}), 0);
        });
    } finally {
        if (prior.policy === undefined) delete process.env.MANAGED_COST_POLICY_JSON; else process.env.MANAGED_COST_POLICY_JSON = prior.policy;
        if (prior.billing === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING; else process.env.NEXT_PUBLIC_ENABLE_BILLING = prior.billing;
        if (connected) await db.dropDatabase();
        await client.close();
    }
});

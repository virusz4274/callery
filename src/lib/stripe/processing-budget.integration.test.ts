import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { getBillingAccount, ledgerKey } from './ledger';
import { getOperatorCost, hasUnsettledOperatorCosts } from './legacy-operator-costs';
import { closeProcessingBudget, settleProcessingChild } from './legacy-processing-budget';
import { seedAcceptedProcessing } from './legacy-test-support';

/** Disposable Mongo CAS only; no new expense admission, provider or saved environment calls. */
test('accepted historical processing settles concurrently on disposable Mongo for every funding family', { skip: !process.env.VOSIFT_TEST_MONGODB_URI }, async t => {
    const client = new MongoClient(process.env.VOSIFT_TEST_MONGODB_URI!, { serverSelectionTimeoutMS: 15_000 });
    const db = client.db(`vt_legacy_ai_${randomUUID().replaceAll('-', '').slice(0, 18)}`);
    try {
        await client.connect();
        for (const source of ['customer', 'trial', 'grant', 'internal', 'selfhost'] as const) await t.test(source, async () => {
            const subject = `historical-${source}`, id = `${subject}:audio`;
            const children = Array.from({ length: 8 }, (_, n) => ({ id: `${id}:summary:${n}`, maximumCostMicros: 40 }));
            const { receipts, holder } = await seedAcceptedProcessing(db, subject, id, source, children);
            await settleProcessingChild(subject, receipts[0], { outcome: 'unknown' }, db);
            await assert.rejects(closeProcessingBudget(subject, id, db), /Unresolved/);
            await Promise.all(receipts.slice(1).map(receipt => settleProcessingChild(subject, receipt, { outcome: 'completed' }, db)));
            await settleProcessingChild(subject, receipts[0], { outcome: 'completed' }, db);
            await settleProcessingChild(subject, receipts[0], { outcome: 'completed' }, db);
            await closeProcessingBudget(subject, id, db); await closeProcessingBudget(subject, id, db);
            const user = await db.collection('users').findOne({ authSubject: subject });
            if (source === 'customer') {
                const account = getBillingAccount(user as never);
                assert.equal(account.reservedCostMicros, 0); assert.equal(account.recognizedCostMicros, 420);
                assert.equal(account.prepaidSpentMicros, 0); assert.deepEqual(account.receipts, {}); assert.deepEqual(account.outbox, {});
                assert.equal(account.reservations[ledgerKey(receipts[0].id)].outcome, 'completed');
            } else if (source !== 'selfhost') {
                assert.equal(await hasUnsettledOperatorCosts(subject, db), false);
                assert.equal((await getOperatorCost(subject, holder, db))?.state, 'released');
                assert.equal(user!.billingAccount, undefined);
            } else assert.equal(user!.billingAccount, undefined);
        });
    } finally { try { await db.dropDatabase(); } finally { await client.close(); } }
});

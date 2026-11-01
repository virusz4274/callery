import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { hasUnsettledOperatorCosts, releaseOperatorCost, settleOperatorCost, forgetSettledOperatorSubject } from './legacy-operator-costs';
import { acceptedOperatorRow, seedAcceptedOperatorRows } from './legacy-test-support';

test('disposable Mongo reconciles accepted operator history concurrently without minting customer revenue', { skip: !process.env.VOSIFT_TEST_MONGODB_URI }, async () => {
    const client = new MongoClient(process.env.VOSIFT_TEST_MONGODB_URI!, { serverSelectionTimeoutMS: 15_000 });
    const db = client.db(`vt_legacy_ops_${randomUUID().replaceAll('-', '').slice(0, 18)}`);
    try {
        await client.connect();
        const rows = Array.from({ length: 12 }, (_, n) => acceptedOperatorRow(n % 2 ? 'one' : 'two', `job${n}`, 25));
        rows.push(acceptedOperatorRow('one', 'no-request-started', 1));
        await seedAcceptedOperatorRows(db, rows);
        await assert.rejects(forgetSettledOperatorSubject('one', db), /must not be pruned/);
        await Promise.all(rows.slice(0, 12).map(row => settleOperatorCost(row.subject, row.id, { actualCostMicros: 10, evidenceId: `measured:${row.id}` }, db)));
        await releaseOperatorCost('one', 'no-request-started', db);
        assert.equal(await hasUnsettledOperatorCosts('one', db), false);
        assert.equal(await db.collection('users').countDocuments({ billingAccount: { $exists: true } }), 0);
        await settleOperatorCost(rows[0].subject, rows[0].id, { actualCostMicros: 10, evidenceId: `measured:${rows[0].id}` }, db);
        const pool = await db.collection('billing_operator_budget').findOne({});
        const amounts = Object.values(pool!.subjects) as { spentMicros: number; reservedMicros: number }[];
        assert.equal(amounts.reduce((sum, row) => sum + row.spentMicros, 0), 120);
        assert.equal(amounts.reduce((sum, row) => sum + row.reservedMicros, 0), 0);
        const before = await db.collection('billing_operator_budget').findOne({});
        await assert.rejects(settleOperatorCost('one', 'unaccepted-new-call', { actualCostMicros: 100 }, db), /not found/);
        assert.deepEqual(await db.collection('billing_operator_budget').findOne({}), before);
        await forgetSettledOperatorSubject('one', db);
        assert.equal(await hasUnsettledOperatorCosts('two', db), false);
        const remaining = await db.collection('billing_operator_budget').findOne({});
        assert.equal(Object.values(remaining!.reservations).some((row: unknown) => (row as { subject: string }).subject === 'one'), false);
        assert.equal(Object.values(remaining!.months).reduce((sum: number, row: unknown) => sum + (row as { spentMicros: number }).spentMicros, 0), 120);
    } finally { try { await db.dropDatabase(); } finally { await client.close(); } }
});

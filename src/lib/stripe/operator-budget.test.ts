import test from 'node:test';
import assert from 'node:assert/strict';
import * as legacy from './legacy-operator-costs';
import { getOperatorCost, forgetSettledOperatorSubject, hasUnsettledOperatorCosts, releaseOperatorCost, settleOperatorCost } from './legacy-operator-costs';
import { ledgerKey } from './ledger';
import { clone, userFixture } from './test-support';
import { legacyMemoryDatabase, acceptedOperatorRow, seedAcceptedOperatorRows } from './legacy-test-support';

const fixture = () => { const memory = legacyMemoryDatabase(); return { memory, db: memory.asDb() }; };

test('historical operator expenses have recovery APIs without spending caps or admission APIs', () => {
    for (const name of ['reserveOperatorCost', 'allocateOperatorCost', 'ensureTrialStorageReserve']) assert.equal(name in legacy, false, name);
});

test('accepted failed calls remain retained, reconcile once and never create customer revenue', async () => {
    const { memory, db } = fixture();
    await memory.collection('users').insertOne(userFixture() as never);
    await seedAcceptedOperatorRows(db, Array.from({ length: 8 }, (_, n) => acceptedOperatorRow('owner', `job${n}`, 25)));
    await settleOperatorCost('owner', 'job0', { actualCostMicros: 25, outcome: 'unknown' }, db);
    assert.equal(await hasUnsettledOperatorCosts('owner', db), true);
    await settleOperatorCost('owner', 'job0', { actualCostMicros: 10, evidenceId: 'verified-usage' }, db);
    await settleOperatorCost('owner', 'job0', { actualCostMicros: 10, evidenceId: 'verified-usage' }, db);
    await Promise.all(Array.from({ length: 7 }, (_, n) => releaseOperatorCost('owner', `job${n + 1}`, db)));
    assert.equal(await hasUnsettledOperatorCosts('owner', db), false);
    const pool = memory.collection('billing_operator_budget').values[0] as { subjects: Record<string, { spentMicros: number; reservedMicros: number }> };
    assert.deepEqual(pool.subjects[ledgerKey('owner')], { spentMicros: 10, reservedMicros: 0 });
    assert.equal(memory.user().billingAccount, undefined);
    await assert.rejects(settleOperatorCost('owner', 'job1', { actualCostMicros: 1 }, db), /Released/);
});

test('unresolved historical evidence prevents erasure and missing receipts cannot manufacture holds', async () => {
    const { memory, db } = fixture();
    await seedAcceptedOperatorRows(db, [acceptedOperatorRow('first', 'accepted', 100)]);
    await assert.rejects(forgetSettledOperatorSubject('first', db), /must not be pruned/);
    await assert.rejects(settleOperatorCost('second', 'new-call', { actualCostMicros: 1 }, db), /not found/);
    assert.equal(await hasUnsettledOperatorCosts('first', db), true);
    assert.equal(await hasUnsettledOperatorCosts('second', db), false);
    assert.equal(Object.keys(memory.collection('billing_operator_budget').values[0].reservations as object).length, 1);
    const empty = fixture();
    await assert.rejects(releaseOperatorCost('nobody', 'unaccepted', empty.db), /legacy expense account/);
    assert.equal(empty.memory.collection('billing_operator_budget').values.length, 0);
});

test('a losing historical settlement cannot archive its uncommitted cost or evidence', async () => {
    const { memory, db } = fixture(), now = new Date();
    const rows = [acceptedOperatorRow('owner', 'oldest', 25), acceptedOperatorRow('owner', 'archive-trigger', 1)];
    for (let n = 0; n < 256; n++) rows.push(acceptedOperatorRow('owner', `completed:${n}`, 1, { state: 'settled', actualCostMicros: 0, evidenceId: `immutable:${n}`, finishedAt: now }));
    await seedAcceptedOperatorRows(db, rows);
    const collection = memory.collection('billing_operator_budget');
    const originalReplace = (collection as unknown as { replaceOne: (filter: { _id: string; revision: number }, row: unknown) => Promise<{ matchedCount: number }> }).replaceOne;
    let loseFirst = true;
    Object.assign(collection, { replaceOne: async (filter: { _id: string; revision: number }, row: unknown) => {
        if (loseFirst) {
            loseFirst = false;
            await settleOperatorCost('owner', 'oldest', { actualCostMicros: 10, evidenceId: 'winner-evidence' }, db);
            return { matchedCount: 0 };
        }
        return originalReplace(filter, row);
    } });
    await assert.rejects(settleOperatorCost('owner', 'oldest', { actualCostMicros: 20, evidenceId: 'loser-evidence' }, db), /settlement conflict/);
    await releaseOperatorCost('owner', 'archive-trigger', db);
    const archived = memory.collection('billing_operator_cost_receipts').values.find(row => row._id === ledgerKey('owner:oldest'))!;
    assert.equal(archived.actualCostMicros, 10); assert.equal(archived.evidenceId, 'winner-evidence');
    await settleOperatorCost('owner', 'oldest', { actualCostMicros: 10, evidenceId: 'winner-evidence' }, db);
    const pool = collection.values[0] as { subjects: Record<string, { spentMicros: number; reservedMicros: number }> };
    assert.deepEqual(pool.subjects[ledgerKey('owner')], { spentMicros: 10, reservedMicros: 0 });
});

test('historical Internal observations compact without losing unknown cost provenance or later evidence', async () => {
    const { memory, db } = fixture();
    await memory.collection('users').insertOne(userFixture({ planKey: 'internal', billingEntitlement: undefined, stripeCustomerId: undefined }) as never);
    const rows = Array.from({ length: 280 }, (_, n) => acceptedOperatorRow('owner', `unpriced:${n}`, 0, { fundingKind: 'internal', unpriced: true }));
    await seedAcceptedOperatorRows(db, rows, true);
    for (const row of rows) await settleOperatorCost('owner', row.id, { actualCostMicros: 0, outcome: 'completed', costBasis: 'unpriced' }, db);
    const pool = memory.collection('billing_internal_costs').values[0] as { reservations: Record<string, unknown> };
    assert.ok(Object.keys(pool.reservations).length < 256);
    const archive = memory.collection('billing_internal_cost_receipts');
    assert.ok(archive.values.length > 0); assert.equal(await hasUnsettledOperatorCosts('owner', db), true);
    for (const row of rows) await settleOperatorCost('owner', row.id, { actualCostMicros: 0, outcome: 'completed', evidenceId: `actual:${row.id}` }, db);
    assert.equal(await hasUnsettledOperatorCosts('owner', db), false);
    assert.ok(archive.values.every(row => row.unpriced === false && row.costBasis === 'verified'));
    assert.equal(memory.user().billingAccount, undefined);
});

test('immutable archived history is unchanged by a conflicting reconciliation attempt', async () => {
    const { memory, db } = fixture();
    await seedAcceptedOperatorRows(db, [acceptedOperatorRow('owner', 'already-paid', 25, { state: 'settled', actualCostMicros: 10, evidenceId: 'original' })]);
    const before = clone(memory.collection('billing_operator_budget').values);
    await assert.rejects(settleOperatorCost('owner', 'already-paid', { actualCostMicros: 11, evidenceId: 'replacement' }, db), /settlement conflict/);
    assert.deepEqual(memory.collection('billing_operator_budget').values, before);
    assert.equal((await getOperatorCost('owner', 'already-paid', db))?.evidenceId, 'original');
});

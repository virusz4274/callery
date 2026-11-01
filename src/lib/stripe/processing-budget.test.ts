import test from 'node:test';
import assert from 'node:assert/strict';
import * as legacy from './legacy-processing-budget';
import { getBillingAccount, ledgerKey } from './ledger';
import { legacyMemoryDatabase, seedAcceptedProcessing } from './legacy-test-support';

const setup = async (children: Array<{ id: string; maximumCostMicros: number }> = []) => {
    const memory = legacyMemoryDatabase(), db = memory.asDb();
    return { memory, db, ...await seedAcceptedProcessing(db, 'owner', 'accepted-audio', 'customer', children) };
};

test('the legacy processing adapter exposes recovery but no new budget admission', () => {
    for (const name of ['prepareProcessingBudget', 'activateProcessingBudget', 'getProcessingBudget', 'reserveProcessingChild', 'createEnrichmentBudget']) {
        assert.equal(name in legacy, false, name);
    }
});

test('an accepted historical child settles once without replaying audio or retail charges', async () => {
    const { memory, db, snapshot, receipts } = await setup([{ id: 'saved-summary', maximumCostMicros: 150 }]);
    await legacy.settleProcessingChild('owner', receipts[0], { actualCostMicros: 50, outcome: 'completed' }, db);
    await legacy.settleProcessingChild('owner', receipts[0], { actualCostMicros: 50, outcome: 'completed' }, db);
    await legacy.closeProcessingBudget('owner', snapshot.id, db);
    await legacy.closeProcessingBudget('owner', snapshot.id, db);
    const account = getBillingAccount(memory.user());
    assert.equal(account.recognizedCostMicros, 150); assert.equal(account.reservedCostMicros, 0);
    assert.equal(account.prepaidSpentMicros, 0); assert.deepEqual(account.receipts, {}); assert.deepEqual(account.outbox, {});
});

test('unknown accepted outcomes remain held for reconciliation; a saved result resolves without a second expense', async () => {
    const { memory, db, snapshot, receipts } = await setup([{ id: 'lost-response', maximumCostMicros: 77 }]);
    await legacy.settleProcessingChild('owner', receipts[0], { outcome: 'unknown' }, db);
    await assert.rejects(legacy.closeProcessingBudget('owner', snapshot.id, db), /Unresolved/);
    assert.equal(getBillingAccount(memory.user()).reservations[ledgerKey(receipts[0].id)].outcome, 'unknown');
    const before = getBillingAccount(memory.user()).recognizedCostMicros;
    await legacy.settleProcessingChild('owner', receipts[0], { outcome: 'completed' }, db);
    assert.equal(getBillingAccount(memory.user()).recognizedCostMicros, before);
    await legacy.closeProcessingBudget('owner', snapshot.id, db);
    assert.equal(getBillingAccount(memory.user()).reservedCostMicros, 0);
});

test('a local prepared checkpoint releases only its provably unused historical hold', async () => {
    const { memory, db, snapshot, receipts } = await setup([{ id: 'never-submitted', maximumCostMicros: 30 }]);
    assert.equal(await legacy.retireLegacyProcessingBudget('owner', snapshot.id, {
        summary: { reservationId: receipts[0].id, state: 'prepared' },
    }, db), true);
    const account = getBillingAccount(memory.user());
    assert.equal(account.reservations[ledgerKey(receipts[0].id)].state, 'released');
    assert.equal(account.recognizedCostMicros, 100); assert.equal(account.reservedCostMicros, 0);
});

test('started calls are never released or replayed; durable saved responses finish original settlement', async () => {
    const { memory, db, snapshot, receipts } = await setup([{ id: 'submitted-before-crash', maximumCostMicros: 30 }]);
    assert.equal(await legacy.retireLegacyProcessingBudget('owner', snapshot.id, {}, db), false);
    assert.equal(await legacy.retireLegacyProcessingBudget('owner', snapshot.id, {
        summary: { reservationId: receipts[0].id, state: 'started' },
    }, db), false);
    assert.equal(getBillingAccount(memory.user()).reservedCostMicros, 400);
    const checkpoints = { summary: { reservationId: receipts[0].id, state: 'response_saved', result: 'Recovered response', actualCostMicros: 10 } };
    assert.equal(await legacy.retireLegacyProcessingBudget('owner', snapshot.id, checkpoints, db), true);
    assert.equal(await legacy.retireLegacyProcessingBudget('owner', snapshot.id, checkpoints, db), true);
    assert.equal(getBillingAccount(memory.user()).recognizedCostMicros, 110);
    assert.equal(getBillingAccount(memory.user()).reservedCostMicros, 0);
});

test('legacy receipt identity remains immutable and missing journals cannot create a new expense', async () => {
    const { memory, db, receipts } = await setup([{ id: 'accepted-child', maximumCostMicros: 30 }]);
    await assert.rejects(legacy.settleProcessingChild('owner', { ...receipts[0], maximumCostMicros: 31 }, { outcome: 'completed' }, db), /unavailable/);
    await assert.rejects(legacy.settleProcessingChild('other-owner', receipts[0], { outcome: 'completed' }, db), /unavailable/);
    assert.equal(getBillingAccount(memory.user()).reservedCostMicros, 400);
    assert.equal(memory.collection(legacy.PROCESSING_BUDGETS).values.length, 1);
});

test('closing loses safely to a concurrently recovered historical child intent', async () => {
    const { memory, db, snapshot } = await setup(), records = memory.collection(legacy.PROCESSING_BUDGETS);
    const update = records.updateOne.bind(records); let raced = false;
    records.updateOne = async (filter, patch, options) => {
        if (filter.children && !raced) {
            raced = true;
            await update({ _id: ledgerKey(`owner:${snapshot.id}`) }, { $set: { 'children.recovered': { state: 'unknown', receipt: {
                version: 1, id: 'recovered-intent', parentReceiptId: snapshot.id, fundingSource: 'customer', maximumCostMicros: 1,
            } } } });
        }
        return update(filter, patch, options);
    };
    await assert.rejects(legacy.closeProcessingBudget('owner', snapshot.id, db), /changed/);
    assert.equal(getBillingAccount(memory.user()).reservedCostMicros, 400);
    assert.equal(records.values[0].state, 'active');
});

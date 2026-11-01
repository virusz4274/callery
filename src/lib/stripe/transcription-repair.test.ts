import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { MemoryBillingDatabase, userFixture } from './test-support';
import { createTranscriptionReceipt, repairTranscriptionReceipts, type TranscriptionReceipt } from './transcription-receipt';
import { getBillingAccount, ledgerKey } from './ledger';

test('receipt repair preserves legacy delivery evidence, isolates unresolved money and settles new audio despite old recording marks', async t => {
    const previous = process.env.NEXT_PUBLIC_ENABLE_BILLING;
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
    t.after(() => { if (previous === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING; else process.env.NEXT_PUBLIC_ENABLE_BILLING = previous; });
    const memory = new MemoryBillingDatabase(), db = memory.asDb();
    const user = userFixture({ planKey: 'internal', role: 'user', billingEntitlement: { source: 'admin', grantedAt: new Date() }, stripeCustomerId: undefined,
        transcriptionUsed: 1000, transcriptionAllocation: 0 });
    await memory.collection('users').insertOne(user as never);
    const healthy = await createTranscriptionReceipt(user, 'new-audio', 'attempt', 'soniox', 'stt-async-v5', 15, 1000, db);
    const legacy: TranscriptionReceipt = { ...healthy, id: 'legacy-delivered-audio', reservationId: undefined, executionPolicy: undefined, accountingMode: undefined,
        billing: { authSubject: user.authSubject, customerId: 'cus_historical', subscriptionId: 'sub_historical', source: 'subscription', acceptedAt: new Date(0) },
        readyAt: new Date(0), costPolicyVersion: undefined, costPolicyFingerprint: undefined };
    const unresolved: TranscriptionReceipt = { ...legacy, id: 'legacy-unresolved-audio', reservationId: 'preserved-legacy-reservation' };
    const account = getBillingAccount(memory.user());
    account.reservations[ledgerKey(unresolved.reservationId!)] = { id: unresolved.reservationId!, kind: 'transcription', state: 'reserved', retailMicros: 0,
        maximumCostMicros: 100, createdAt: new Date(0), expiresAt: new Date('2099-01-01'), allocations: {} };
    memory.user().billingAccount = account;
    const originalHold = structuredClone(account.reservations[ledgerKey(unresolved.reservationId!)]);
    const deliveredId = new ObjectId(), blockedId = new ObjectId(), newId = new ObjectId();
    await memory.collection('recordings').insertOne({ _id: deliveredId, authSubject: user.authSubject, transcriptionReceipt: legacy,
        transcriptionUsageReportId: 'original-legacy-delivery', transcriptionUsageReportedAt: new Date(0) });
    await memory.collection('recordings').insertOne({ _id: blockedId, authSubject: user.authSubject, transcriptionReceipt: unresolved });
    await memory.collection('recordings').insertOne({ _id: newId, authSubject: user.authSubject, transcriptionReceipt: { ...healthy, readyAt: new Date() },
        transcriptionUsageReportId: 'older-audio-on-same-recording', transcriptionUsageReportedAt: new Date(0) });
    assert.equal(await repairTranscriptionReceipts(db), 2);
    assert.equal(memory.user().transcriptionUsed, 1015, 'Only the new canonical audio consumes quota');
    const delivered = await memory.collection('recordings').findOne({ _id: deliveredId });
    assert.equal(delivered?.transcriptionUsageReportId, 'original-legacy-delivery');
    assert.equal((delivered?.transcriptionReceipt as TranscriptionReceipt).costPolicyFingerprint, undefined);
    assert.ok((delivered?.transcriptionReceipt as TranscriptionReceipt).queuedAt instanceof Date);
    const blocked = await memory.collection('recordings').findOne({ _id: blockedId });
    assert.equal((blocked?.transcriptionReceipt as TranscriptionReceipt).queuedAt, undefined);
    assert.match((blocked?.transcriptionSettlementRepair as { error: string }).error, /historical cost schedule/);
    assert.deepEqual(getBillingAccount(memory.user()).reservations[ledgerKey(unresolved.reservationId!)], originalHold, 'Unresolved financial evidence must remain untouched');
    const settled = await memory.collection('recordings').findOne({ _id: newId });
    assert.equal(settled?.transcriptionUsageReportId, healthy.id);
    assert.equal(getBillingAccount(memory.user()).reservations[ledgerKey(healthy.id)].state, 'settled');
    assert.equal(await repairTranscriptionReceipts(db), 0, 'Quarantined rows back off while delivered rows remain idempotent');
    assert.equal(memory.user().transcriptionUsed, 1015);
});

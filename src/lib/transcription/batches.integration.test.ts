import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import type { Recording } from '@/lib/db/types';
import { createTranscriptionBatch, createTranscriptionImport, listTranscriptionWorkspace, repairTranscriptionBatchReservations, updateTranscriptionBatch } from './batches';
import type { TranscriptionBatch } from './batch-types';
import { BILLING_CATALOG } from '@/lib/stripe/catalog';

async function fixture(db: Db, owner: string, count = 3, dateKey: string | null = '2026-10-18') {
    await db.collection('users').updateOne({ authSubject: owner }, { $setOnInsert: {
        authSubject: owner, disabled: false, planKey: 'starter', transcriptionUsed: 0,
        transcriptionAllocation: 100_000, transcriptionSettings: { autoTranscribe: true, defaultProvider: 'gemini' },
        billingSettings: { allowOverage: false },
        billingEntitlement: { source: 'admin', grantedAt: new Date() },
    } }, { upsert: true });
    const { importId } = await createTranscriptionImport(owner, db);
    const recordings = Array.from({ length: count }, (_, index): Recording => ({
        _id: new ObjectId(), authSubject: owner, contactId: null, contactName: null,
        phoneNumber: '', normalizedPhoneNumber: '', r2Key: `fixture/${owner}/${index}`, bulkImportId: importId,
        fileName: `call-${index}.mp3`, standardizedDisplayName: `Call ${index}`, fileSize: 100,
        mimeType: 'audio/mpeg', duration: 60 + index,
        // The filename day must win even when the timestamp lies on another UTC day.
        recordedAt: new Date(Date.UTC(2026, 9, 17, 23, index)), recordingDateKey: dateKey,
        createdAt: new Date(), updatedAt: new Date(), transcriptionStatus: 'pending',
        tags: [], isStarred: false, isArchived: false,
    }));
    if (recordings.length) await db.collection<Recording>('recordings').insertMany(recordings);
    return recordings;
}

// All data and leases live in a disposable random database. No AI or audio calls.
test('persistent transcription batches reserve, recover and pause safely on standalone MongoDB', {
    skip: !process.env.VOSIFT_TEST_MONGODB_URI,
}, async t => {
    const client = new MongoClient(process.env.VOSIFT_TEST_MONGODB_URI!);
    await client.connect();
    const db = client.db(`vt_batches_${randomUUID().replaceAll('-', '').slice(0, 20)}`);
    try {
        await t.test('bulk holds persist with filename dates; ownership and unsafe attempts are excluded', async () => {
            const recordings = await fixture(db, 'waiting', 4);
            await fixture(db, 'someone-else', 1);
            await db.collection<Recording>('recordings').updateOne({ _id: recordings[1]._id }, { $unset: { bulkImportId: '' } });
            await db.collection<Recording>('recordings').updateOne({ _id: recordings[2]._id }, { $set: { transcriptionStatus: 'failed', transcriptionAttemptId: 'uncertain' } });
            await db.collection<Recording>('recordings').updateOne({ _id: recordings[3]._id }, { $set: { externalTranscriptionId: 'provider-id' } });
            const view = await listTranscriptionWorkspace('waiting', {}, db);
            assert.equal(view.waitingTotal, 1);
            assert.equal(view.waiting[0].id, recordings[0]._id.toHexString());
            assert.equal(view.waiting[0].dateKey, '2026-10-18');
            assert.equal(view.waiting[0].recordedAt.slice(0, 10), '2026-10-17');
            assert.equal(await db.collection('integration_jobs').countDocuments(), 0);
        });

        await t.test('saving, editing, reopening and removing a draft preserve unselected recordings', async () => {
            const recordings = await fixture(db, 'draft', 3);
            const ids = recordings.map(recording => recording._id.toHexString());
            const batch = await createTranscriptionBatch('draft', { recordingIds: ids.slice(0, 2), provider: 'gemini', name: 'Tomorrow' }, db);
            assert.equal(batch.status, 'draft');
            assert.equal(batch.totalDuration, 121);
            assert.equal(batch.recordings.length, 2);
            let view = await listTranscriptionWorkspace('draft', {}, db);
            assert.deepEqual(view.waiting.map(recording => recording.id), [ids[2]]);
            assert.equal(view.batches[0].name, 'Tomorrow');
            const edited = await updateTranscriptionBatch('draft', batch.id, { action: 'edit', recordingIds: [ids[1], ids[2]], name: 'Next week' }, db);
            assert.equal(edited.batch?.totalDuration, 123);
            view = await listTranscriptionWorkspace('draft', {}, db);
            assert.deepEqual(view.waiting.map(recording => recording.id), [ids[0]]);
            await assert.rejects(updateTranscriptionBatch('someone-else', batch.id, { action: 'remove' }, db), /not found/);
            await updateTranscriptionBatch('draft', batch.id, { action: 'remove' }, db);
            view = await listTranscriptionWorkspace('draft', {}, db);
            assert.equal(view.waiting.length, 3);
            assert.equal(view.batches.length, 0);
            assert.equal(await db.collection('integration_jobs').countDocuments({ owner: 'draft' }), 0);
        });

        await t.test('dates and unknown-date groups stay separate; concurrent saves cannot reserve twice', async () => {
            const [recording] = await fixture(db, 'concurrent', 1);
            const [unknown] = await fixture(db, 'concurrent', 1, null);
            await assert.rejects(createTranscriptionBatch('concurrent', { recordingIds: [recording._id.toHexString(), unknown._id.toHexString()] }, db), /one recording date/);
            const responses = await Promise.allSettled(Array.from({ length: 2 }, () => createTranscriptionBatch('concurrent', { recordingIds: [recording._id.toHexString()] }, db)));
            assert.equal(responses.filter(result => result.status === 'fulfilled').length, 1);
            assert.equal(await db.collection('transcription_batches').countDocuments({ owner: 'concurrent' }), 1);
            const view = await listTranscriptionWorkspace('concurrent', {}, db);
            assert.equal(view.waiting[0].dateKey, null);
        });

        await t.test('interrupted reservation and removal checkpoints repair without transactions', async () => {
            const recordings = await fixture(db, 'repair', 2);
            const now = new Date();
            const selection = { recordingIds: recordings.map(recording => recording._id.toHexString()), dateKey: '2026-10-18', name: 'Recovered', provider: 'gemini' as const, model: 'test', totalDuration: 121 };
            const batch: TranscriptionBatch = { ...selection, _id: new ObjectId().toHexString(), owner: 'repair', recordingIds: [], status: 'draft', createdAt: now, updatedAt: now, reservationUpdate: selection };
            await db.collection<TranscriptionBatch>('transcription_batches').insertOne(batch);
            await db.collection<Recording>('recordings').updateOne({ _id: recordings[0]._id }, { $set: { transcriptionBatchId: batch._id } });
            await repairTranscriptionBatchReservations(db);
            let view = await listTranscriptionWorkspace('repair', {}, db);
            assert.equal(view.batches[0].recordingIds.length, 2);
            assert.equal(view.waiting.length, 0);
            // Simulate a crash after committing edited membership but before
            // releasing the recording removed from that draft.
            await db.collection<TranscriptionBatch>('transcription_batches').updateOne({ _id: batch._id }, { $set: { recordingIds: [selection.recordingIds[0]], reservationReleasePending: true } });
            await repairTranscriptionBatchReservations(db);
            assert.equal((await listTranscriptionWorkspace('repair', {}, db)).waiting.length, 1);
            await db.collection<TranscriptionBatch>('transcription_batches').updateOne({ _id: batch._id }, { $set: { removing: true } });
            await repairTranscriptionBatchReservations(db);
            view = await listTranscriptionWorkspace('repair', {}, db);
            assert.equal(view.batches.length, 0);
            assert.equal(view.waiting.length, 2);
        });

        await t.test('starts are idempotent; pause freezes new work and membership; other drafts remain saved', async () => {
            const recordings = await fixture(db, 'lifecycle', 3);
            const first = await createTranscriptionBatch('lifecycle', { recordingIds: [recordings[0]._id.toHexString()], provider: 'gemini' }, db);
            const later = await createTranscriptionBatch('lifecycle', { recordingIds: [recordings[1]._id.toHexString()], provider: 'gemini' }, db);
            const started = await updateTranscriptionBatch('lifecycle', first.id, { action: 'start' }, db);
            assert.equal(started.batch?.status, 'running');
            assert.equal((await updateTranscriptionBatch('lifecycle', first.id, { action: 'start' }, db)).batch?.status, 'running');
            await assert.rejects(updateTranscriptionBatch('lifecycle', first.id, { action: 'edit', recordingIds: [recordings[2]._id.toHexString()] }, db), /frozen/);
            await assert.rejects(updateTranscriptionBatch('lifecycle', first.id, { action: 'remove' }, db), /unstarted/);
            await updateTranscriptionBatch('lifecycle', first.id, { action: 'pause' }, db);
            assert.equal((await listTranscriptionWorkspace('lifecycle', {}, db)).batches.find(batch => batch.id === first.id)?.status, 'paused');
            await updateTranscriptionBatch('lifecycle', first.id, { action: 'resume' }, db);
            await db.collection<TranscriptionBatch>('transcription_batches').updateOne({ _id: first.id }, { $set: { status: 'completed' } });
            const view = await listTranscriptionWorkspace('lifecycle', {}, db);
            assert.equal(view.batches.find(batch => batch.id === later.id)?.status, 'draft');
            assert.equal(view.waiting.length, 1);
        });

        await t.test('starting rechecks current quota and account/company policy without sending provider requests', async () => {
            const [recording] = await fixture(db, 'policy', 1);
            const batch = await createTranscriptionBatch('policy', { recordingIds: [recording._id.toHexString()], provider: 'gemini' }, db);
            await db.collection('users').updateOne({ authSubject: 'policy' }, { $set: { disabled: true } });
            await assert.rejects(updateTranscriptionBatch('policy', batch.id, { action: 'start' }, db), /disabled/);
            await db.collection('users').updateOne({ authSubject: 'policy' }, { $set: { disabled: false, transcriptionAllocation: 0 } });
            await db.collection<TranscriptionBatch>('transcription_batches').updateOne({ _id: batch.id }, { $set: { model: BILLING_CATALOG.providers.gemini.model } });
            const billing = process.env.NEXT_PUBLIC_ENABLE_BILLING;
            process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
            try { await assert.rejects(updateTranscriptionBatch('policy', batch.id, { action: 'start' }, db), /transcription quota is exhausted|limit exceeded/i); }
            finally { process.env.NEXT_PUBLIC_ENABLE_BILLING = billing; }
            await db.collection('users').updateOne({ authSubject: 'policy' }, { $set: { transcriptionAllocation: 100_000 } });
            await db.collection('recordings').updateOne({ _id: recording._id }, { $set: { duration: 0 } });
            process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
            try { await assert.rejects(updateTranscriptionBatch('policy', batch.id, { action: 'start' }, db), /duration could not be verified/); }
            finally { process.env.NEXT_PUBLIC_ENABLE_BILLING = billing; }
            await db.collection('system_settings').insertOne({ team: { enabled: true, transcriptionMode: 'off', transcriptionProvider: 'gemini' } });
            await assert.rejects(updateTranscriptionBatch('policy', batch.id, { action: 'start' }, db), /company/);
            await db.collection('system_settings').deleteMany({});
            assert.equal(await db.collection('integration_jobs').countDocuments({ owner: 'policy' }), 0);
        });

        await t.test('progress waits for attached AI processing and failed attempts remain reviewable', async () => {
            const [recording] = await fixture(db, 'progress', 1);
            const batch = await createTranscriptionBatch('progress', { recordingIds: [recording._id.toHexString()], provider: 'gemini' }, db);
            await db.collection<Recording>('recordings').updateOne({ _id: recording._id }, { $set: { transcriptionStatus: 'completed', transcriptionEnrichmentPending: true } });
            await db.collection<{ _id: string; owner: string; batchId: string; recordingId: string; state: string; error?: string }>('integration_jobs').insertOne({ _id: `batch:${batch.id}:${recording._id}`, owner: 'progress', batchId: batch.id, recordingId: recording._id.toHexString(), state: 'running' });
            let view = await listTranscriptionWorkspace('progress', {}, db);
            assert.equal(view.batches[0].completedCount, 0);
            await db.collection('integration_jobs').updateOne({ batchId: batch.id }, { $set: { state: 'needs_review', error: 'Provider outcome uncertain.' } });
            view = await listTranscriptionWorkspace('progress', {}, db);
            assert.equal(view.batches[0].failedCount, 1);
            assert.equal(view.batches[0].recordings[0].error, 'Provider outcome uncertain.');
        });

        await t.test('managed batches use approved weights and models for display and quota admission despite self-host overrides', async () => {
            const priorBilling = process.env.NEXT_PUBLIC_ENABLE_BILLING;
            const priorPricing = process.env.TRANSCRIPTION_PRICING_JSON;
            process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
            process.env.TRANSCRIPTION_PRICING_JSON = JSON.stringify({ soniox: 0.01, gemini: 0.02, elevenlabs: 0.03, openai_compat: 0.04 });
            await db.collection('system_settings').insertOne({ transcriptionMultipliers: { soniox: 0.1, gemini: 0.2, elevenlabs: 0.3, openai_compat: 0.4 } });
            try {
                for (const [provider, approved] of Object.entries(BILLING_CATALOG.providers)) {
                    const owner = `managed-${provider}`;
                    const [recording] = await fixture(db, owner, 1);
                    await db.collection('recordings').updateOne({ _id: recording._id }, { $set: { duration: 61 } });
                    const workspace = await listTranscriptionWorkspace(owner, {}, db);
                    assert.deepEqual(Object.fromEntries(workspace.providers.map(entry => [entry.id, entry.multiplier])), { soniox: 1, elevenlabs: 5, gemini: 3 });
                    await assert.rejects(createTranscriptionBatch(owner, { recordingIds: [recording._id.toHexString()], provider, model: 'unpriced-model' }, db), /not in the priced managed catalog/);
                    await assert.rejects(createTranscriptionBatch(owner, { recordingIds: [recording._id.toHexString()], provider: 'openai_compat', model: 'whisper' }, db), /not available in the managed catalog/);
                    const batch = await createTranscriptionBatch(owner, { recordingIds: [recording._id.toHexString()], provider, model: approved.model }, db);
                    const weightedSeconds = 75 * approved.multiplier;
                    await db.collection('users').updateOne({ authSubject: owner }, { $set: { transcriptionAllocation: weightedSeconds - 1 } });
                    await assert.rejects(updateTranscriptionBatch(owner, batch.id, { action: 'start' }, db), /transcription quota is exhausted|limit exceeded/i);
                    await db.collection<TranscriptionBatch>('transcription_batches').updateOne({ _id: batch.id }, { $set: { model: 'old-unpriced-model' } });
                    await assert.rejects(updateTranscriptionBatch(owner, batch.id, { action: 'start' }, db), /not in the priced managed catalog/);
                    await db.collection<TranscriptionBatch>('transcription_batches').updateOne({ _id: batch.id }, { $set: { model: approved.model } });
                    await db.collection('users').updateOne({ authSubject: owner }, { $set: { transcriptionAllocation: weightedSeconds } });
                    assert.equal((await updateTranscriptionBatch(owner, batch.id, { action: 'start' }, db)).batch?.status, 'running');
                    assert.equal(await db.collection('integration_jobs').countDocuments({ owner }), 0);
                }
                assert.deepEqual((await db.collection('system_settings').findOne({}))?.transcriptionMultipliers, { soniox: 0.1, gemini: 0.2, elevenlabs: 0.3, openai_compat: 0.4 });
            } finally {
                await db.collection('system_settings').deleteMany({});
                if (priorBilling === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING;
                else process.env.NEXT_PUBLIC_ENABLE_BILLING = priorBilling;
                if (priorPricing === undefined) delete process.env.TRANSCRIPTION_PRICING_JSON;
                else process.env.TRANSCRIPTION_PRICING_JSON = priorPricing;
            }
        });

        await t.test('self-host batch displays use environment defaults until an administrator supplies an override', async () => {
            const priorBilling = process.env.NEXT_PUBLIC_ENABLE_BILLING;
            const priorPricing = process.env.TRANSCRIPTION_PRICING_JSON;
            process.env.NEXT_PUBLIC_ENABLE_BILLING = 'false';
            process.env.TRANSCRIPTION_PRICING_JSON = JSON.stringify({ soniox: 2, gemini: 0.25, elevenlabs: 4 });
            try {
                await fixture(db, 'self-host-policy', 1);
                let workspace = await listTranscriptionWorkspace('self-host-policy', {}, db);
                assert.equal(workspace.providers.find(provider => provider.id === 'gemini')?.multiplier, 0.25);
                assert.equal(workspace.providers.find(provider => provider.id === 'soniox')?.multiplier, 2);
                await db.collection('system_settings').insertOne({ transcriptionMultipliers: { soniox: 3, gemini: 0.75 } });
                workspace = await listTranscriptionWorkspace('self-host-policy', {}, db);
                assert.equal(workspace.providers.find(provider => provider.id === 'gemini')?.multiplier, 0.75);
                assert.equal(workspace.providers.find(provider => provider.id === 'soniox')?.multiplier, 3);
                assert.equal(workspace.providers.find(provider => provider.id === 'elevenlabs')?.multiplier, 4);
            } finally {
                await db.collection('system_settings').deleteMany({});
                if (priorBilling === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING;
                else process.env.NEXT_PUBLIC_ENABLE_BILLING = priorBilling;
                if (priorPricing === undefined) delete process.env.TRANSCRIPTION_PRICING_JSON;
                else process.env.TRANSCRIPTION_PRICING_JSON = priorPricing;
            }
        });

        await t.test('pagination exposes every recording and stops each list independently', async () => {
            await fixture(db, 'pages', 105);
            await fixture(db, 'pages', 2, null);
            const first = await listTranscriptionWorkspace('pages', {}, db);
            assert.equal(first.waitingTotal, 107);
            assert.equal(first.waiting.length, 100);
            assert.ok(first.waitingNextCursor);
            const second = await listTranscriptionWorkspace('pages', { waitingAfter: first.waitingNextCursor, batchesAfter: 'end' }, db);
            assert.equal(second.waiting.length, 7);
            assert.equal(second.waitingNextCursor, null);
            assert.equal(new Set([...first.waiting, ...second.waiting].map(recording => recording.id)).size, 107);
            assert.equal(second.waiting.at(-1)?.dateKey, null);
            const exhausted = await listTranscriptionWorkspace('pages', { waitingAfter: 'end', batchesAfter: 'end' }, db);
            assert.deepEqual(exhausted.waiting, []);
            assert.equal(exhausted.waitingTotal, 107);
            await assert.rejects(listTranscriptionWorkspace('pages', { waitingAfter: 'not-a-cursor' }, db), /cursor/);
        });
    } finally { await db.dropDatabase(); await client.close(); }
});

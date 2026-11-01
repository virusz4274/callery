import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { Collections, getMongoClient, getMongoDb } from '@/lib/mongodb';
import { createCoreIndexes } from '@/lib/db/init/indexes';
import { seedPlans, seedSystemSettings } from '@/lib/db/init/seed';
import { ensureUserProfile } from '@/lib/db/users/ensure-profile';
import type { Recording } from '@/lib/db/types';
import { initializeDirectUploadForUser } from '@/lib/direct-upload-service';
import { verifyUploadSessionToken } from '@/lib/upload-session-token';
import { IntegrationCollections } from './database';
import { ApiError } from './contracts';
import { completeUpload, type UploadSession } from './uploads';
import { ingestionStorage } from './storage';
import { processIngestion } from './worker';

test('bulk imports persist their hold before upload and through standalone completion recovery', {
    skip: !process.env.VOSIFT_TEST_MONGODB_URI,
}, async t => {
    const saved = { ...process.env };
    const uri = new URL(process.env.VOSIFT_TEST_MONGODB_URI!);
    uri.pathname = `/vt_bulk_ingestion_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
    process.env.MONGODB_URI = uri.toString();
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'false';
    const db = await getMongoDb();
    const client = await getMongoClient();
    const objects = new Map<string, Buffer>();
    let failPromotion = false;
    const audio = Buffer.from('fixture audio');
    t.mock.method(ingestionStorage, 'remove', async (key: string) => { objects.delete(key); });
    t.mock.method(ingestionStorage, 'head', async (key: string) => objects.has(key)
        ? { ContentLength: objects.get(key)!.length, ContentType: 'audio/wav' } : null);
    t.mock.method(ingestionStorage, 'validate', async () => 30);
    t.mock.method(ingestionStorage, 'promote', async (from: string, to: string) => {
        if (failPromotion) { failPromotion = false; throw new Error('Interrupted promotion'); }
        objects.set(to, Buffer.from(objects.get(from)!));
    });
    try {
        await createCoreIndexes(db, Collections);
        await seedPlans(db, Collections);
        await seedSystemSettings(db, Collections);
        const owner = new ObjectId().toString();
        const other = new ObjectId().toString();
        await ensureUserProfile(owner, 'bulk-owner@test.invalid');
        await ensureUserProfile(other, 'bulk-other@test.invalid');
        await db.collection(Collections.USERS).updateOne({ authSubject: owner }, { $set: { 'transcriptionSettings.autoTranscribe': true } });
        const importId = randomUUID();
        await db.collection<{ _id: string; owner: string; createdAt: Date }>('transcription_imports').insertOne({ _id: importId, owner, createdAt: new Date() });

        await t.test('untrusted import references cannot acquire an upload session', async () => {
            const input = { fileName: 'Call John_261018_003000.wav', fileSize: audio.length, bulkImportId: importId };
            assert.equal((await initializeDirectUploadForUser(other, input)).success, false);
            assert.equal((await initializeDirectUploadForUser(owner, { ...input, bulkImportId: randomUUID() })).success, false);
            assert.equal(await db.collection(IntegrationCollections.uploads).countDocuments({}), 0);
        });

        for (const companyAutomatic of [false, true]) {
            await t.test(`${companyAutomatic ? 'company automatic' : 'personal automatic'} policy preserves bulk holds and filename dates`, async () => {
                await db.collection(Collections.SYSTEM_SETTINGS).updateOne({}, { $set: { 'team.enabled': companyAutomatic, 'team.transcriptionMode': 'automatic' } });
                const fileName = companyAutomatic
                    ? 'Meeting notes.wav'
                    : '20261018_003000.000+1400_in_5551234.wav';
                const initialized = await initializeDirectUploadForUser(owner, { fileName, fileSize: audio.length, bulkImportId: importId });
                assert.equal(initialized.success, true, initialized.error);
                assert.ok(initialized.uploadUrl);
                const payload = await verifyUploadSessionToken(initialized.uploadToken!);
                assert.ok(payload?.uploadId);
                const session = await db.collection<UploadSession>(IntegrationCollections.uploads).findOne({ _id: payload.uploadId });
                assert.equal(session?.bulkImportId, importId);
                assert.equal(session?.owner, owner);
                objects.set(session!.stagingKey, audio);

                failPromotion = true;
                await assert.rejects(completeUpload(session!), ApiError);
                await db.collection<UploadSession>(IntegrationCollections.uploads).updateOne({ _id: session!._id }, { $set: { leaseUntil: new Date(0) } });
                const recovered = await processIngestion();
                assert.equal(recovered.recovered, 1);
                assert.equal(recovered.failed, 0);
                const recording = await db.collection<Recording>(Collections.RECORDINGS).findOne({ ingestionId: session!._id });
                assert.equal(recording?.bulkImportId, importId);
                assert.equal(recording?.recordingDateKey, companyAutomatic ? null : '2026-10-18');
                if (!companyAutomatic) assert.equal(recording?.recordedAt.toISOString(), '2026-10-17T10:30:00.000Z');
                assert.equal(recording?.transcriptionStatus, 'pending');
                assert.equal(await db.collection(IntegrationCollections.jobs).countDocuments({}), 0);

                // A stale caller copy must not remove the persisted hold during recovery.
                await db.collection<UploadSession>(IntegrationCollections.uploads).updateOne({ _id: session!._id }, { $set: { state: 'finalizing', leaseUntil: new Date(0) } });
                const { bulkImportId: _discarded, ...staleSession } = session!;
                await completeUpload({ ...staleSession, state: 'finalizing' });
                assert.equal(await db.collection(IntegrationCollections.jobs).countDocuments({}), 0);
            });
        }
    } finally {
        t.mock.restoreAll();
        await db.dropDatabase();
        await client.close();
        for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
        Object.assign(process.env, saved);
    }
});

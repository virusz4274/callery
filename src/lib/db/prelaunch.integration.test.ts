import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Collections, getMongoClient, getMongoDb } from '@/lib/mongodb';
import { createCoreIndexes } from './init/indexes';
import { seedPlans, seedSystemSettings } from './init/seed';
import { ensureUserProfile } from './users/ensure-profile';
import { findUserByAuthSubject } from './users/lookup';
import { updateUserProfile } from './users/profile';
import { updateSystemSettingsDocument } from './system-settings';
import { toUserResponse } from './converters';
import { createRecording } from './recordings/write';
import { getRecordingsPageForExport } from './recordings/read';
import { upsertContacts } from './contacts/write/upsert-contacts';
import { claimNextExportJob, createExportJob, getExportJob, toExportJobResponse } from './export-jobs';
import { persistCheckpoint } from '@/lib/export-processor/lifecycle';
import { resolveTranscriptionProvider, type TranscriptionProvider } from '@/services/transcription';
import { UpdateProfileBodySchema } from '@/lib/schemas';
import type { Contact, Plan, Recording, SystemSettings } from './types';

// Opt-in and isolated: all application helpers connect to a fresh random database.
test('fresh profiles, settings, contacts and export checkpoints use the current data shapes', {
    skip: !process.env.VOSIFT_TEST_MONGODB_URI,
}, async t => {
    const originalUri = process.env.MONGODB_URI;
    const uri = new URL(process.env.VOSIFT_TEST_MONGODB_URI!);
    uri.pathname = `/vosift_prelaunch_tests_${randomUUID().replaceAll('-', '')}`;
    process.env.MONGODB_URI = uri.toString();
    const client = await getMongoClient();
    const db = await getMongoDb();

    try {
        await t.test('admin edits require initialization; initialization is complete and repeatable', async () => {
            await assert.rejects(updateSystemSettingsDocument({ maintenanceMode: true }), /db:init/);
            assert.equal(await db.collection(Collections.SYSTEM_SETTINGS).countDocuments(), 0);
            await assert.rejects(seedSystemSettings(db, Collections), /Seed plans/);
            await createCoreIndexes(db, Collections);
            await seedPlans(db, Collections);
            await seedSystemSettings(db, Collections);

            const settings = await db.collection<SystemSettings>(Collections.SYSTEM_SETTINGS).findOne({});
            assert.ok(settings);
            const plan = await db.collection<Plan>(Collections.PLANS).findOne({ _id: settings.defaultPlanId });
            assert.equal(plan?.key, 'free-trial');
            assert.equal(settings.allowSignups, true);
            assert.deepEqual(settings.transcriptionMultipliers, { soniox: 1, elevenlabs: 5, gemini: 0.5, openai_compat: 0.1 });

            await updateSystemSettingsDocument({
                maintenanceMode: true,
                transcriptionMultipliers: { soniox: 2, elevenlabs: 4 },
            });
            await createCoreIndexes(db, Collections);
            await seedPlans(db, Collections);
            await seedSystemSettings(db, Collections);
            assert.equal(await db.collection(Collections.SYSTEM_SETTINGS).countDocuments(), 1);
            assert.equal(await db.collection(Collections.PLANS).countDocuments(), 6);
            const repeated = await db.collection<SystemSettings>(Collections.SYSTEM_SETTINGS).findOne({});
            assert.equal(repeated?.maintenanceMode, true);
            assert.ok(repeated?.defaultPlanId.equals(settings.defaultPlanId));
            assert.deepEqual(repeated?.transcriptionMultipliers, { soniox: 2, elevenlabs: 4, gemini: 0.5, openai_compat: 0.1 });
        });

        await t.test('independent Better Auth profiles create complete profiles, including concurrent signup', async () => {
            for (const provider of ['local', 'another-user'] as const) {
                const results = await Promise.all(Array.from({ length: 4 }, () =>
                    ensureUserProfile(provider, `${provider}@example.com`, 'New User', undefined, false)
                ));
                assert.equal(results.filter(result => result.wasCreated).length, 1);
                const user = await findUserByAuthSubject(provider);
                assert.ok(user);
                assert.equal(user.storagePeakUsed, 0);
                assert.equal(user.storageUsed, 0);
                assert.equal(user.transcriptionUsed, 0);
                assert.equal(user.totalContacts, 0);
                assert.equal(user.role, 'user');
                assert.deepEqual(user.googleSync, { status: 'not_connected', lastError: null });
                assert.deepEqual(user.notificationSettings, { activityDigest: 'weekly', ingestSuccess: true, ingestFail: true });
                assert.deepEqual(user.storageSettings, { deletionPolicy: 'never' });
                assert.deepEqual(user.transcriptionSettings, { autoTranscribe: true });
                assert.deepEqual(user.billingSettings, { allowOverage: false });
                assert.equal(toUserResponse(user, 'Free Trial').googleSync.status, 'not_connected');
            }
        });

        await t.test('partial and concurrent profile edits preserve required siblings and literal names', async () => {
            const patch = UpdateProfileBodySchema.parse({
                notificationSettings: { activityDigest: 'monthly' },
                storageSettings: { deletionPolicy: '3m' },
                transcriptionSettings: { defaultModel: 'chosen-model' },
            });
            await updateUserProfile('local', patch);
            await Promise.all([
                updateUserProfile('local', { notificationSettings: { ingestSuccess: false }, firstName: '$firstName' }),
                updateUserProfile('local', { notificationSettings: { ingestFail: false }, lastName: 'Changed' }),
                updateUserProfile('local', { transcriptionSettings: { autoTranscribe: false } }),
            ]);
            const user = await findUserByAuthSubject('local');
            assert.ok(user);
            assert.equal(user.name, '$firstName Changed');
            assert.deepEqual(user.notificationSettings, { activityDigest: 'monthly', ingestSuccess: false, ingestFail: false });
            assert.deepEqual(user.storageSettings, { deletionPolicy: '3m' });
            assert.deepEqual(user.transcriptionSettings, { autoTranscribe: false, defaultModel: 'chosen-model' });
            assert.equal((await findUserByAuthSubject('another-user'))?.name, 'New User');
            assert.equal(await updateUserProfile('missing', patch), null);
        });

        await t.test('all four provider choices survive profile serialization and unrelated edits', async () => {
            const providers: TranscriptionProvider[] = ['soniox', 'elevenlabs', 'gemini', 'openai_compat'];
            for (const defaultProvider of providers) {
                await updateUserProfile('local', UpdateProfileBodySchema.parse({ transcriptionSettings: { defaultProvider } }));
                const user = await updateUserProfile('local', { transcriptionSettings: { autoTranscribe: true } });
                assert.ok(user);
                const response = toUserResponse(user, 'Free Trial');
                assert.equal(response.transcriptionSettings.defaultProvider, defaultProvider);
                assert.equal(response.transcriptionSettings.defaultModel, 'chosen-model');
                assert.equal(resolveTranscriptionProvider(response), defaultProvider);
            }
        });

        const recordingIds: string[] = [];
        await t.test('contact sync links normalized phone numbers within the owner and unlinks removed numbers', async () => {
            for (const [index, authSubject] of ['local', 'local', 'another-user'].entries()) {
                const recording = await createRecording({
                    authSubject, contactId: null, contactName: 'Caller', phoneNumber: '+91 93530 96358',
                    r2Key: `test-recording-${index}`, fileName: `call-${index}.mp3`, standardizedDisplayName: `Call ${index}`,
                    fileSize: 100, mimeType: 'audio/mpeg',
                    duration: 60, recordedAt: new Date('2026-10-01T00:00:00Z'), transcriptionStatus: 'pending',
                    tags: [], isStarred: false, isArchived: false,
                });
                assert.equal(recording.normalizedPhoneNumber, '+919353096358');
                if (authSubject === 'local') recordingIds.push(recording._id.toString());
            }
            const contactInput = { googleContactId: 'people/test', name: 'Synced Contact', phoneNumbers: ['+919353096358'], email: null };
            assert.deepEqual(await upsertContacts('local', [contactInput]), { created: 1, updated: 0 });
            const contact = await db.collection<Contact>(Collections.CONTACTS).findOne({ authSubject: 'local' });
            assert.ok(contact);
            assert.equal(contact.totalRecordings, 2);
            assert.equal(await db.collection<Recording>(Collections.RECORDINGS).countDocuments({ authSubject: 'local', contactId: contact._id }), 2);
            assert.equal((await db.collection<Recording>(Collections.RECORDINGS).findOne({ authSubject: 'another-user' }))?.contactId, null);
            assert.equal((await findUserByAuthSubject('local'))?.totalContacts, 1);

            assert.deepEqual(await upsertContacts('local', [{ ...contactInput, phoneNumbers: [] }]), { created: 0, updated: 1 });
            assert.equal(await db.collection<Recording>(Collections.RECORDINGS).countDocuments({ authSubject: 'local', contactId: contact._id }), 0);
            assert.equal((await db.collection<Contact>(Collections.CONTACTS).findOne({ _id: contact._id }))?.totalRecordings, 0);
            await upsertContacts('local', []);
            assert.equal((await findUserByAuthSubject('local'))?.totalContacts, 0);
        });

        await t.test('stale exports resume with persisted parts and a deterministic cursor', async () => {
            const job = await createExportJob({
                authSubject: 'local', status: 'pending', progress: 0, totalRecordings: 0,
                processedRecordings: 0, parts: [], checkpoint: { nextPartNumber: 1 },
            });
            assert.deepEqual(toExportJobResponse(job).parts, []);
            const claimed = await claimNextExportJob();
            assert.equal(claimed?._id.toString(), job._id.toString());
            assert.equal(claimed?.checkpoint.nextPartNumber, 1);
            const [first] = await getRecordingsPageForExport('local', 1);
            await persistCheckpoint({
                jobId: job._id.toString(), authSubject: 'local', totalRecordings: 2, processedRecordings: 1,
                cursor: { recordedAt: first.recordedAt, id: first._id.toString() }, nextPartNumber: 2,
                parts: [{ key: 'export/part-001.zip', size: 1024 }],
            });
            await db.collection(Collections.EXPORT_JOBS).updateOne({ _id: job._id }, { $set: { updatedAt: new Date(0) } });
            const resumed = await claimNextExportJob();
            assert.ok(resumed);
            assert.equal(resumed.checkpoint.nextPartNumber, 2);
            assert.equal(resumed.parts[0].key, 'export/part-001.zip');
            assert.equal(resumed.processedRecordings, 1);
            const remaining = await getRecordingsPageForExport('local', 10, {
                recordedAt: resumed.checkpoint.cursorRecordedAt!, id: resumed.checkpoint.cursorId!,
            });
            assert.deepEqual([first._id.toString(), ...remaining.map(recording => recording._id.toString())], recordingIds.sort());
            assert.equal(remaining.length, 1);
            assert.equal(await getExportJob(job._id.toString(), 'another-user'), null);
            assert.equal(await claimNextExportJob(), null);
        });
    } finally {
        await db.dropDatabase();
        await client.close();
        if (originalUri === undefined) delete process.env.MONGODB_URI;
        else process.env.MONGODB_URI = originalUri;
    }
});

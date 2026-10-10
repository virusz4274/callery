import '@/test/action-context';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { BSON, ObjectId } from 'mongodb';
import { NextRequest } from 'next/server';
import { inActionContext } from '@/test/action-context';
import { Collections, getMongoClient, getMongoDb } from './mongodb';
import { createCoreIndexes } from './db/init/indexes';
import { seedPlans, seedSystemSettings } from './db/init/seed';
import { createAuth } from './auth/server';
import { findUserByAuthSubject, ensureUserProfile } from './db/users';
import { getTeamSettings, getRecordingForActor, resolveExportSubject } from './team-policy';
import { assertSignupAllowed } from './team-invitations';
import { getRequestIdentity, getMobileSyncUserFromRequest } from './auth-utils';
import { createMobileSyncSessionToken } from './mobile-sync-session-token';
import { updateUserProfile } from './db/users/profile';
import { getExpiredRecordings } from './db/recordings/retention';
import { purgeExpiredSoftDeletedUsers } from './db/users/soft-delete';
import { deleteUserData } from './db/delete-user-data';
import { getEmailService, type SendEmailInput } from './email';
import type { Recording, ExportJob } from './db/types';

// Only fixture records are written. The database name is replaced before any
// application helper connects, and all storage/email sends stay in this process.
test('small team admission, archive permissions, removal, processing and recovery', {
    skip: !process.env.VOSIFT_TEST_MONGODB_URI,
}, async t => {
    const saved = { ...process.env };
    const uri = new URL(process.env.VOSIFT_TEST_MONGODB_URI!);
    uri.pathname = `/vt_team_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    process.env.MONGODB_URI = uri.toString();
    process.env.ADMIN_EMAILS = 'admin@example.test';
    process.env.EMAIL_PROVIDER = 'none';
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'false';
    const client = await getMongoClient();
    const db = await getMongoDb();
    const restored = client.db(`vt_restore_${randomUUID().replaceAll('-', '').slice(0, 20)}`);
    const temporary = await mkdtemp(path.join(tmpdir(), 'vosift-team-restore-'));
    const emails: SendEmailInput[] = [];
    const base = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth`;
    const password = 'FixturePassword123!';
    const call = (auth: ReturnType<typeof createAuth>, endpoint: string, body?: Record<string, unknown>) => auth.handler(new Request(`${base}${endpoint}`, {
        method: body ? 'POST' : 'GET', headers: { origin: process.env.NEXT_PUBLIC_APP_URL!, 'content-type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
    }));
    const request = (token: string) => new NextRequest(base, { headers: { authorization: `Bearer ${token}` } });
    const audio = Buffer.alloc(44 + 16000); // One second of PCM: original bytes are backed up unchanged.
    audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8);
    audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
    audio.writeUInt32LE(8000, 24); audio.writeUInt32LE(16000, 28); audio.writeUInt16LE(2, 32);
    audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(16000, 40);
    const objects = new Map<string, Buffer>();
    try {
        await createCoreIndexes(db, Collections); await seedPlans(db, Collections); await seedSystemSettings(db, Collections);
        const personalAuth = createAuth(db);
        const adminSignup = await call(personalAuth, '/sign-up/email', { name: 'Company Admin', email: 'admin@example.test', password });
        assert.equal(adminSignup.status, 200);
        const { user: adminIdentity, token: adminToken } = await adminSignup.json();
        const admin = (await findUserByAuthSubject(adminIdentity.id))!;
        assert.equal((await getTeamSettings()).enabled, false);
        process.env.EMAIL_PROVIDER = 'smtp';
        t.mock.method(getEmailService()!, 'send', async (input: SendEmailInput) => { emails.push(input); });
        const auth = createAuth(db, async input => { emails.push(input); });
        const { saveTeamSettings, inviteTeamMember, revokeTeamInvitation, getCompanyRecordings, getTeamAdministration } = await import('@/app/actions/team');
        const { deleteUserMutation, restoreUserMutation, updateUserRoleMutation } = await import('@/app/actions/admin/users/mutations');
        const { createShareLink } = await import('@/app/actions/sharing');
        const { deleteRecordings } = await import('@/app/actions/delete-recordings');
        const { startExport, getExportStatus } = await import('@/app/actions/export');
        const { GET: playback } = await import('@/app/api/recordings/[id]/play/route');
        const { getStorageClient } = await import('./r2');
        const { initializeDirectUploadForUser, completeDirectUploadForUser } = await import('./direct-upload-service');
        const { startManualTranscription } = await import('./transcription/manual');
        const { startAutoTranscriptionForRecording } = await import('@/app/actions/upload/transcription');
        t.mock.method(getStorageClient(), 'send', async (command: { constructor: { name: string }; input: { Key: string; CopySource?: string; Body?: AsyncIterable<Uint8Array> } }) => {
            const { Key, Body } = command.input;
            if (command.constructor.name === 'PutObjectCommand') {
                const chunks: Buffer[] = []; for await (const chunk of Body!) chunks.push(Buffer.from(chunk));
                objects.set(Key, Buffer.concat(chunks)); return {};
            }
            if (command.constructor.name === 'DeleteObjectCommand') { objects.delete(Key); return {}; }
            if (command.constructor.name === 'CopyObjectCommand') {
                const source = decodeURIComponent(command.input.CopySource!.replace(/^test-bucket\//, ''));
                const bytes = objects.get(source); if (!bytes) throw new Error('Fixture copy source not found');
                objects.set(Key, Buffer.from(bytes)); return {};
            }
            const bytes = objects.get(Key);
            if (!bytes) throw Object.assign(new Error('Fixture object not found'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
            return { ContentLength: bytes.length, ContentType: 'audio/wav', Body: Readable.from([bytes], { objectMode: false }) };
        });
        const team = { ...(await getTeamSettings()), enabled: true, companyName: 'Pilot Company' };
        await t.test('activation validates prerequisites, pending cleanup and one-way setup', async () => {
            process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
            await assert.rejects(inActionContext(adminToken, () => saveTeamSettings(team)), /billing disabled/);
            process.env.NEXT_PUBLIC_ENABLE_BILLING = 'false'; process.env.EMAIL_PROVIDER = 'none';
            await assert.rejects(inActionContext(adminToken, () => saveTeamSettings(team)), /SMTP or Resend/);
            process.env.EMAIL_PROVIDER = 'smtp';
            await db.collection(Collections.USERS).updateOne({ _id: admin._id }, { $set: { softDelete: { isDeleted: true } } });
            // The administrator must remain active for the action, so use a separate deletion marker.
            await db.collection(Collections.USERS).updateOne({ _id: admin._id }, { $unset: { softDelete: '' } });
            const marker = await db.collection(Collections.USERS).insertOne({ authSubject: 'cleanup-marker', email: 'cleanup@example.test', softDelete: { isDeleted: true } });
            await assert.rejects(inActionContext(adminToken, () => saveTeamSettings(team)), /scheduled for deletion/);
            await db.collection(Collections.USERS).deleteOne({ _id: marker.insertedId });
            await inActionContext(adminToken, () => saveTeamSettings(team));
            await assert.rejects(inActionContext(adminToken, () => saveTeamSettings({ ...team, enabled: false })), /personal mode/);
            assert.equal((await db.collection(Collections.SYSTEM_SETTINGS).findOne({}))?.allowSignups, false);
            await seedSystemSettings(db, Collections);
            assert.equal((await getTeamSettings()).enabled, true);
        });

        await t.test('uninvited, expired and revoked email and Google identities are denied; resend renews admission', async () => {
            const context = await auth.$context;
            const outsider = await call(auth, '/sign-up/email', { name: 'Uninvited', email: 'outsider@example.test', password });
            // Verification-required signup uses a generic response to avoid email enumeration.
            assert.equal((await outsider.json()).token, null);
            assert.equal(await db.collection('user').countDocuments({ email: 'outsider@example.test' }), 0);
            await assert.rejects(context.internalAdapter.createUser({ email: 'outsider-google@example.test', name: 'Outsider', emailVerified: true }, { method: 'oauth', oauth: { providerId: 'google' } }), /invitation/i);
            await inActionContext(adminToken, () => inviteTeamMember('expired@example.test'));
            await db.collection(Collections.TEAM_INVITATIONS).updateOne({ email: 'expired@example.test' }, { $set: { expiresAt: new Date(0) } });
            await assert.rejects(assertSignupAllowed('expired@example.test'), /invitation/);
            await inActionContext(adminToken, () => inviteTeamMember('revoked@example.test'));
            const revoked = await db.collection(Collections.TEAM_INVITATIONS).findOne({ email: 'revoked@example.test' });
            await inActionContext(adminToken, () => revokeTeamInvitation(revoked!._id.toString()));
            await assert.rejects(assertSignupAllowed('revoked@example.test'), /invitation/);
            await inActionContext(adminToken, () => inviteTeamMember('revoked@example.test'));
            await assertSignupAllowed(' REVOKED@example.test ');
            assert.equal(await db.collection(Collections.TEAM_INVITATIONS).countDocuments({ email: 'revoked@example.test' }), 1);
        });

        await inActionContext(adminToken, () => inviteTeamMember('member@example.test'));
        const signup = await call(auth, '/sign-up/email', { name: 'Member One', email: 'member@example.test', password });
        assert.equal(signup.status, 200);
        const memberIdentity = (await signup.json()).user;
        assert.equal((await findUserByAuthSubject(memberIdentity.id))?.teamInvitationPending, true);
        const verifyUrl = emails.filter(email => email.to === 'member@example.test' && email.subject.includes('Verify')).at(-1)!.html.match(/href="([^"]+)"/)![1];
        await auth.handler(new Request(verifyUrl));
        const login = await call(auth, '/sign-in/email', { email: memberIdentity.email, password });
        assert.equal(login.status, 200);
        const { token: memberToken } = await login.json();
        const memberCookie = login.headers.get('set-cookie')!.split(';')[0];
        const member = (await findUserByAuthSubject(memberIdentity.id))!;
        assert.equal(member.role, 'user'); assert.equal(member.teamInvitationPending, false);
        await inActionContext(adminToken, () => inviteTeamMember('google@example.test'));
        const context = await auth.$context;
        const googleIdentity = await context.internalAdapter.createUser({ email: 'google@example.test', name: 'Member Two', emailVerified: true }, { method: 'oauth', oauth: { providerId: 'google' } });
        await context.internalAdapter.createAccount({ userId: googleIdentity.id, providerId: 'google', accountId: 'google-fixture' });
        const googleToken = (await context.internalAdapter.createSession(googleIdentity.id))!.token;
        const second = (await findUserByAuthSubject(googleIdentity.id))!;
        // An interrupted profile insert can be repaired after its invitation is consumed.
        await db.collection(Collections.USERS).deleteOne({ _id: second._id });
        await ensureUserProfile(googleIdentity.id, googleIdentity.email, googleIdentity.name, undefined, true);

        const upload = await initializeDirectUploadForUser(member.authSubject, { fileName: 'CallRecord_20260925-153045_+919876543210.wav', fileSize: audio.length, mimeType: 'audio/wav' });
        assert.equal(upload.success, true);
        const key = decodeURIComponent(new URL(upload.uploadUrl!).pathname).replace(/^\/test-bucket\//, '').replace(/^\//, '');
        objects.set(key, audio);
        const simultaneous = await Promise.all(Array.from({ length: 2 }, () => completeDirectUploadForUser(member.authSubject, { uploadToken: upload.uploadToken! })));
        const completion = simultaneous[0];
        assert.equal(simultaneous[1].recordingId, completion.recordingId);
        assert.equal(completion.success, true); assert.equal(completion.shouldStartAutoTranscription, false);
        const recordingId = completion.recordingId!;
        const recording = (await getRecordingForActor(recordingId, member.authSubject))!;

        await t.test('backup retains phone metadata and bytes; duplicate completion counts storage once', async () => {
            const repeated = await Promise.all(Array.from({ length: 3 }, () => completeDirectUploadForUser(member.authSubject, { uploadToken: upload.uploadToken! })));
            for (const result of repeated) assert.equal(result.recordingId, recordingId);
            assert.equal(recording.fileName, 'CallRecord_20260925-153045_+919876543210.wav');
            assert.equal(recording.recordedAt.toISOString(), new Date(2026, 8, 25, 15, 30, 45).toISOString());
            assert.equal(recording.duration, 1);
            assert.equal(recording.fileSize, audio.length); assert.deepEqual(objects.get(recording.r2Key), audio);
            assert.equal((await findUserByAuthSubject(member.authSubject))?.storageUsed, audio.length);
        });

        await t.test('members stay isolated; administrator queries and playback use uploader identity and short links', async () => {
            assert.equal(await getRecordingForActor(recordingId, googleIdentity.id), null);
            assert.ok(await getRecordingForActor(recordingId, admin.authSubject));
            const contact = await db.collection(Collections.CONTACTS).insertOne({ authSubject: member.authSubject, name: 'Uploader contact', googleContactId: 'people/fixture', phoneNumbers: ['+919876543210'] });
            await db.collection(Collections.CONTACTS).insertOne({ authSubject: admin.authSubject, name: 'Administrator contact', googleContactId: 'people/fixture', phoneNumbers: ['+919876543210'] });
            await db.collection(Collections.RECORDINGS).updateOne({ _id: recording._id }, { $set: { contactId: contact.insertedId } });
            assert.equal((await getRecordingForActor(recordingId, admin.authSubject))?.contactName, 'Uploader contact');
            const own = await playback(request(memberToken), { params: Promise.resolve({ id: recordingId }) });
            assert.equal(own.status, 200); assert.equal(new URL((await own.json()).playbackUrl).searchParams.get('X-Amz-Expires'), '300');
            assert.equal((await playback(request(googleToken), { params: Promise.resolve({ id: recordingId }) })).status, 404);
            assert.equal((await playback(request(adminToken), { params: Promise.resolve({ id: recordingId }) })).status, 200);
            await assert.rejects(inActionContext(memberToken, () => getCompanyRecordings()), /Unauthorized/);
            await assert.rejects(inActionContext(memberToken, () => startExport(admin._id.toString())), /Unauthorized/);
            await assert.rejects(inActionContext(memberToken, () => getExportStatus(admin._id.toString())), /Unauthorized/);
            assert.equal((await inActionContext(memberToken, () => deleteRecordings([recordingId]))).success, false);
            const results = await inActionContext(adminToken, () => getCompanyRecordings({ employeeId: member._id.toString(), search: '9876543210', startDate: '2026-09-25', endDate: '2026-09-25' }));
            assert.equal(results.total, 1); assert.equal(results.recordings[0].uploaderName, 'Member One');
        });

        await t.test('company provider and model govern manual and automatic processing without provider network calls', async () => {
            const { TranscriptionFactory } = await import('@/services/transcription/factory');
            const requests: { provider: string; model?: string }[] = [];
            t.mock.method(TranscriptionFactory, 'getService', (provider: 'soniox') => ({
                transcribe: async (_url: string, options?: { model?: string }) => {
                    requests.push({ provider, model: options?.model });
                    return { text: '', languageCode: 'en', segments: [], transcriptionId: `fixture-${requests.length}`, provider, model: options?.model || 'fixture' };
                }, deleteTranscript: async () => {},
            }));
            const processing = { ...team, transcriptionProvider: 'soniox' as const, transcriptionModel: 'company-model' };
            await inActionContext(adminToken, () => saveTeamSettings({ ...processing, transcriptionMode: 'manual' }));
            const tasks: (() => Promise<void>)[] = [];
            const manual = await inActionContext(memberToken, () => startManualTranscription(member.authSubject, recordingId), tasks);
            assert.equal(manual.success, true); assert.equal(tasks.length, 1);
            await tasks[0]();
            await db.collection(Collections.RECORDINGS).updateOne({ _id: recording._id }, { $set: { transcriptionStatus: 'pending' } });
            await db.collection(Collections.USERS).updateOne({ _id: member._id }, { $set: { 'transcriptionSettings.autoTranscribe': false, 'transcriptionSettings.defaultProvider': 'gemini' } });
            await inActionContext(adminToken, () => saveTeamSettings({ ...processing, transcriptionMode: 'automatic' }));
            assert.equal((await startAutoTranscriptionForRecording(member.authSubject, recordingId)).outcome, 'completed');
            assert.deepEqual(requests, [{ provider: 'soniox', model: 'company-model' }, { provider: 'soniox', model: 'company-model' }]);
            await inActionContext(adminToken, () => saveTeamSettings(team));
        });

        await t.test('off/manual policy protects backup and rejects member overrides and public sharing', async () => {
            assert.match((await startManualTranscription(member.authSubject, recordingId)).error!, /disabled/);
            assert.equal((await startAutoTranscriptionForRecording(member.authSubject, recordingId)).outcome, 'skipped');
            await assert.rejects(updateUserProfile(member.authSubject, { storageSettings: { deletionPolicy: '3m' } }), /administrator/);
            await assert.rejects(updateUserProfile(member.authSubject, { transcriptionSettings: { autoTranscribe: true } }), /administrator/);
            await assert.rejects(inActionContext(adminToken, () => createShareLink(recordingId, '7d')), /Public sharing/);
            await inActionContext(adminToken, () => saveTeamSettings({ ...team, transcriptionMode: 'manual', transcriptionProvider: 'soniox', transcriptionModel: 'company-model' }));
            assert.match((await startManualTranscription(member.authSubject, recordingId, { provider: 'gemini' })).error!, /administrator/);
            assert.equal((await startAutoTranscriptionForRecording(member.authSubject, recordingId)).outcome, 'skipped');
            await inActionContext(adminToken, () => saveTeamSettings(team));
        });

        const syncToken = await createMobileSyncSessionToken(member.authSubject);
        await t.test('removal revokes cookies, bearer, sync and upload completion without deleting the employee archive', async () => {
            await assert.rejects(deleteUserData(member.authSubject), /disabled without deleting/);
            await inActionContext(adminToken, () => deleteUserMutation(member._id.toString()));
            assert.equal(await getRequestIdentity(request(memberToken)), null);
            assert.equal(await getRequestIdentity(new NextRequest(base, { headers: { cookie: memberCookie } })), null);
            assert.equal(await getMobileSyncUserFromRequest(request(syncToken)), null);
            assert.equal((await completeDirectUploadForUser(member.authSubject, { uploadToken: upload.uploadToken! })).success, false);
            assert.equal((await call(auth, '/sign-in/email', { email: member.email, password })).status, 403);
            assert.equal((await purgeExpiredSoftDeletedUsers()).purged, 0);
            assert.equal(await db.collection(Collections.RECORDINGS).countDocuments({ authSubject: member.authSubject }), 1);
            assert.equal((await findUserByAuthSubject(member.authSubject))?.softDelete, undefined);
            assert.equal(await db.collection(Collections.CONTACTS).countDocuments({ authSubject: member.authSubject }), 1);
            const { sendDigestEmail, notifyIngestComplete } = await import('./email/notifications');
            const removed = (await findUserByAuthSubject(member.authSubject))!;
            const before = emails.length;
            assert.equal(await sendDigestEmail(removed, 'weekly', { recordings: 1, seconds: 1, topContacts: [] }), false);
            await notifyIngestComplete(removed, { succeeded: 1, failed: 0, failedNames: [] });
            assert.equal(emails.length, before);
            assert.equal(await resolveExportSubject(admin.authSubject, member._id.toString()), member.authSubject);
            const administration = await inActionContext(adminToken, getTeamAdministration);
            assert.equal(administration?.employees.find(u => u.id === member._id.toString())?.storageUsed, audio.length);
        });

        await t.test('administrator exports a removed employee through the existing processor and receives its notification', async () => {
            const result = await inActionContext(adminToken, () => startExport(member._id.toString()));
            assert.equal(result.success, true);
            const { processExport } = await import('./export-processor');
            await processExport((result as { jobId: string }).jobId, member.authSubject);
            const job = await inActionContext(adminToken, () => getExportStatus(member._id.toString()));
            assert.equal(job?.status, 'completed');
            const storedJob = await db.collection<ExportJob>(Collections.EXPORT_JOBS).findOne({ _id: new ObjectId((result as { jobId: string }).jobId) });
            assert.equal(storedJob?.processedRecordings, 1);
            assert.ok(objects.get(storedJob!.parts[0].key)!.length > 0);
            assert.equal(emails.filter(email => email.subject.includes('Export is Ready')).at(-1)?.to, admin.email);
        });

        await t.test('company retention reaches former employees; restore cannot revive old tokens; last admin stays active', async () => {
            await db.collection<Recording>(Collections.RECORDINGS).updateOne({ _id: new ObjectId(recordingId) }, { $set: { recordedAt: new Date('2020-01-01') } });
            assert.equal((await getExpiredRecordings()).length, 0);
            await inActionContext(adminToken, () => saveTeamSettings({ ...team, retentionPolicy: '3m' }));
            assert.equal((await getExpiredRecordings())[0].authSubject, member.authSubject);
            await inActionContext(adminToken, () => restoreUserMutation(member._id.toString()));
            assert.equal((await findUserByAuthSubject(member.authSubject))?.disabled, false);
            assert.equal(await getMobileSyncUserFromRequest(request(syncToken)), null);
            assert.equal((await completeDirectUploadForUser(member.authSubject, { uploadToken: upload.uploadToken! })).success, false);
            await assert.rejects(inActionContext(adminToken, () => deleteUserMutation(admin._id.toString())), /active administrator/);
            await assert.rejects(inActionContext(adminToken, () => updateUserRoleMutation(admin._id.toString(), 'user')), /active administrator/);
            await assert.rejects(inActionContext(googleToken, () => deleteUserMutation(admin._id.toString())), /Unauthorized/);
        });

        await t.test('BSON and audio restore into a separate database preserve identity, policies and original bytes', async () => {
            for (const { name } of await db.listCollections().toArray()) {
                const documents = await db.collection(name).find({}).toArray();
                if (documents.length) await restored.collection(name).insertMany(documents.map(doc => BSON.deserialize(BSON.serialize(doc))));
            }
            await createCoreIndexes(restored, Collections);
            assert.equal((await getTeamSettings(restored)).enabled, true);
            assert.equal(await restored.collection(Collections.USERS).countDocuments(), await db.collection(Collections.USERS).countDocuments());
            assert.equal((await restored.collection<Recording>(Collections.RECORDINGS).findOne({ _id: recording._id }))?.authSubject, member.authSubject);
            await writeFile(path.join(temporary, 'backup.wav'), audio); await cp(path.join(temporary, 'backup.wav'), path.join(temporary, 'restored.wav'));
            assert.equal(createHash('sha256').update(await readFile(path.join(temporary, 'restored.wav'))).digest('hex'), createHash('sha256').update(audio).digest('hex'));
        });

        await t.test('explicit admin archive deletion decrements the uploader and records the action', async () => {
            assert.equal((await inActionContext(adminToken, () => deleteRecordings([recordingId]))).success, true);
            assert.equal((await findUserByAuthSubject(member.authSubject))?.storageUsed, 0);
            assert.equal(await db.collection(Collections.ADMIN_LOGS).countDocuments({ action: 'RECORDING_DELETE' }), 1);
        });
    } finally {
        t.mock.restoreAll(); await restored.dropDatabase(); await db.dropDatabase(); await client.close();
        await rm(temporary, { recursive: true, force: true });
        for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
        Object.assign(process.env, saved);
    }
});

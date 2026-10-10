import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { Collections, getMongoClient, getMongoDb } from '@/lib/mongodb';
import { ensureUserProfile } from '@/lib/db/users/ensure-profile';
import { seedPlans, seedSystemSettings } from '@/lib/db/init/seed';
import { createCoreIndexes } from '@/lib/db/init/indexes';
import { accountUpload, reserveUpload, releaseUpload } from './accounting';
import { authenticateApi, changeApiToken, createApiToken, type ApiToken } from './tokens';
import { IntegrationCollections } from './database';
import { ApiError, UploadSchema, fingerprint } from './contracts';
import { createUpload, completeUpload, ownedUpload, cancelUpload, type UploadSession } from './uploads';
import { ingestionStorage } from './storage';
import { apiRecording } from './recordings';
import { consumeRateLimit } from '@/lib/rate-limit';
import { simpleUpload } from './simple-upload';
import { processIngestion } from './worker';
import { enqueueTranscription } from './jobs';
import { deleteUserData } from '@/lib/db/delete-user-data';

test('API token isolation, atomic quota, retryable ingestion and standalone recovery', { skip: !process.env.VOSIFT_TEST_MONGODB_URI }, async t => {
    const saved = { ...process.env };
    const uri = new URL(process.env.VOSIFT_TEST_MONGODB_URI!); uri.pathname = `/vt_ingestion_${randomUUID().replaceAll('-', '')}`;
    process.env.MONGODB_URI = uri.toString(); process.env.NEXT_PUBLIC_ENABLE_BILLING = 'false';
    const db = await getMongoDb(); const client = await getMongoClient();
    const objects = new Map<string, Buffer>();
    const parts = new Map<string, Map<number, Buffer>>();
    let failPromotion = false;
    const wav = Buffer.alloc(16044); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16000, 40);
    // State-machine tests exercise real MongoDB concurrency while making storage
    // failures deterministic. The optional storage test below exercises the SDK.
    t.mock.method(ingestionStorage, 'create', async () => { const id = randomUUID(); parts.set(id, new Map()); return id; });
    t.mock.method(ingestionStorage, 'abort', async (_key: string, id: string) => { parts.delete(id); });
    t.mock.method(ingestionStorage, 'remove', async (key: string) => { objects.delete(key); });
    t.mock.method(ingestionStorage, 'head', async (key: string) => objects.has(key) ? { ContentLength: objects.get(key)!.length, ContentType: 'audio/wav' } : null);
    t.mock.method(ingestionStorage, 'validate', async (key: string) => { if (objects.get(key)?.toString('ascii', 0, 4) !== 'RIFF') throw new ApiError(400, 'invalid_audio', 'Invalid audio'); return 1; });
    t.mock.method(ingestionStorage, 'putPart', async (_key: string, id: string, number: number, body: Buffer) => { parts.get(id)!.set(number, Buffer.from(body)); return { ETag: `part-${number}` }; });
    t.mock.method(ingestionStorage, 'complete', async (key: string, id: string, size: number) => { const map = parts.get(id); if (!map) throw new Error('NoSuchUpload'); const body = Buffer.concat([...map.entries()].sort(([a], [b]) => a - b).map(([, bytes]) => bytes)); if (body.length !== size) throw new ApiError(409, 'incomplete_upload', 'Missing parts'); objects.set(key, body); parts.delete(id); });
    t.mock.method(ingestionStorage, 'promote', async (from: string, to: string) => { if (failPromotion) { failPromotion = false; throw new Error('Connection lost'); } objects.set(to, Buffer.from(objects.get(from)!)); });
    try {
        await createCoreIndexes(db, Collections); await seedPlans(db, Collections); await seedSystemSettings(db, Collections);
        const owner = new ObjectId().toString(); const other = new ObjectId().toString();
        await ensureUserProfile(owner, 'owner@test.invalid'); await ensureUserProfile(other, 'other@test.invalid');
        await db.collection(Collections.USERS).updateMany({}, { $set: { 'transcriptionSettings.autoTranscribe': false } });
        const issued = await createApiToken(owner, { name: 'Sync', expiresAt: null, scopes: ['recordings:upload', 'recordings:read', 'recordings:download'] }, db);
        let actor = await authenticateApi(new Headers({ Authorization: `Bearer ${issued.secret}` }), db);
        const otherIssued = await createApiToken(other, { name: 'Other' }, db);
        const otherActor = await authenticateApi(new Headers({ Authorization: `Bearer ${otherIssued.secret}` }), db);
        await t.test('credentials cannot substitute for sessions, upload tokens, or other accounts', async () => {
            await assert.rejects(authenticateApi(new Headers({ Authorization: 'Bearer browser-session' }), db), ApiError);
            await assert.rejects(authenticateApi(new Headers({ Authorization: `Bearer ${issued.secret}wrong` }), db), ApiError);
            assert.ok(!(await db.collection<ApiToken>(IntegrationCollections.tokens).findOne({ _id: issued.id }))!.hash.includes(issued.secret));
        });
        await t.test('rotation preserves upload ownership and revocation cancels unfinished uploads', async () => {
            const credential = await createApiToken(owner, { name: 'Rotating sync', scopes: ['recordings:upload'] }, db);
            const before = await authenticateApi(new Headers({ Authorization: `Bearer ${credential.secret}` }), db);
            const session = await createUpload(before, UploadSchema.parse({ fileName: 'rotate.wav', fileSize: wav.length }), fingerprint('rotate'));
            const rotated = await changeApiToken(owner, credential.id, true);
            await assert.rejects(authenticateApi(new Headers({ Authorization: `Bearer ${credential.secret}` }), db), ApiError);
            const after = await authenticateApi(new Headers({ Authorization: `Bearer ${rotated.secret}` }), db);
            assert.equal((await ownedUpload(after, session._id))._id, session._id);
            await changeApiToken(owner, credential.id, false);
            await assert.rejects(authenticateApi(new Headers({ Authorization: `Bearer ${rotated.secret}` }), db), ApiError);
            assert.equal((await db.collection<UploadSession>(IntegrationCollections.uploads).findOne({ _id: session._id }))!.state, 'cancelled');
            await processIngestion();
            assert.equal((await db.collection(Collections.USERS).findOne({ authSubject: owner }))!.uploadReservations?.[session._id], undefined);
        });
        await t.test('concurrent quota reservations and counter receipts cannot overcount', async () => {
            process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
            await db.collection(Collections.USERS).updateOne({ authSubject: owner }, { $set: { storageAllocation: 100, 'billingSettings.allowOverage': false } });
            const attempts = await Promise.allSettled([reserveUpload(owner, 'quota-a', 60, db), reserveUpload(owner, 'quota-b', 60, db)]);
            assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
            await releaseUpload(owner, 'quota-a', db); await releaseUpload(owner, 'quota-b', db);
            await reserveUpload(owner, 'receipt', 60, db);
            await Promise.all(Array.from({ length: 8 }, () => accountUpload(owner, 'receipt', 60, 2, db)));
            const user = await db.collection(Collections.USERS).findOne({ authSubject: owner }); assert.equal(user!.storageUsed, 60); assert.equal(user!.totalRecordings, 1); assert.equal(user!.totalDuration, 2);
            await db.collection(Collections.USERS).updateOne({ authSubject: owner }, { $set: { storageUsed: 0, totalRecordings: 0, totalDuration: 0 }, $unset: { uploadReceipts: '' } });
            process.env.NEXT_PUBLIC_ENABLE_BILLING = 'false';
        });
        await t.test('concurrent first rate-limit requests admit exactly the configured count', async () => {
            const responses = await Promise.all(Array.from({ length: 30 }, () => consumeRateLimit({ key: 'concurrent', limit: 5, windowMs: 60000 }, db)));
            assert.equal(responses.filter(response => response.allowed).length, 5);
        });
        let recordingId = '';
        await t.test('idempotent initialization, owner isolation, completion and staging immutability', async () => {
            const input = UploadSchema.parse({ fileName: 'crm-call.wav', fileSize: wav.length, recordedAt: '2026-10-09T01:02:03Z', source: 'crm', externalId: 'call-1', metadata: { dealId: 'deal-1' } });
            const session = await createUpload(actor, input, fingerprint('one'));
            assert.equal((await createUpload(actor, input, fingerprint('one')))._id, session._id);
            await assert.rejects(createUpload(actor, { ...input, fileSize: 1 }, fingerprint('one')), ApiError);
            await assert.rejects(ownedUpload(otherActor, session._id), ApiError);
            objects.set(session.stagingKey, wav);
            const completed = await completeUpload(session); recordingId = completed.recordingId!;
            assert.equal((await completeUpload(completed)).recordingId, recordingId);
            assert.equal(await db.collection(Collections.RECORDINGS).countDocuments({ authSubject: owner }), 1);
            objects.set(session.stagingKey, Buffer.from('tampered'));
            assert.deepEqual(objects.get(session.finalKey), wav);
            await assert.rejects(apiRecording(otherActor, recordingId, 'read'), ApiError);
            assert.equal((await createUpload(actor, input, fingerprint('another'))).recordingId, recordingId);
        });
        await t.test('failed promotion and lost completion checkpoints recover without double accounting', async () => {
            const input = UploadSchema.parse({ fileName: 'recovery.wav', fileSize: wav.length });
            const session = await createUpload(actor, input, fingerprint('recovery')); objects.set(session.stagingKey, wav); failPromotion = true;
            await assert.rejects(completeUpload(session), ApiError);
            await db.collection<UploadSession>(IntegrationCollections.uploads).updateOne({ _id: session._id }, { $set: { leaseUntil: new Date(0) } });
            const result = await processIngestion(); assert.equal(result.recovered, 1);
            const checkpoint = await db.collection<UploadSession>(IntegrationCollections.uploads).findOne({ _id: session._id });
            await db.collection<UploadSession>(IntegrationCollections.uploads).updateOne({ _id: session._id }, { $set: { state: 'finalizing', leaseUntil: new Date(0) } });
            await completeUpload({ ...checkpoint!, state: 'finalizing' });
            const user = await db.collection(Collections.USERS).findOne({ authSubject: owner }); assert.equal(user!.storageUsed, wav.length * 2); assert.equal(user!.totalRecordings, 2);
        });
        await t.test('streaming simple uploads validate bytes and retry one recording', async () => {
            const request = () => { const form = new FormData(); form.set('metadata', JSON.stringify({ fileName: 'simple.wav', fileSize: wav.length })); form.set('file', new Blob([wav], { type: 'audio/wav' }), 'simple.wav'); return new Request('https://app.test/api/v1/recordings', { method: 'POST', body: form }); };
            const one = await simpleUpload(request(), actor, fingerprint('simple')); const two = await simpleUpload(request(), actor, fingerprint('simple'));
            assert.equal(one.recordingId, two.recordingId);
            const wrong = new FormData(); wrong.set('file', new Blob([wav]), 'simple.wav'); wrong.set('metadata', '{}');
            await assert.rejects(simpleUpload(new Request('https://app.test/api', { method: 'POST', body: wrong }), actor, fingerprint('wrong-order')), ApiError);
        });
        await t.test('cancellation and expiration release capacity and retain failed cleanup', async () => {
            const session = await createUpload(actor, UploadSchema.parse({ fileName: 'cancel.wav', fileSize: wav.length }), fingerprint('cancel'));
            await cancelUpload(session);
            assert.equal((await cancelUpload(await ownedUpload(actor, session._id))).state, 'cancelled');
            const user = await db.collection(Collections.USERS).findOne({ authSubject: owner }); assert.equal(user!.uploadReservations?.[session._id], undefined);
            const expired = await createUpload(actor, UploadSchema.parse({ fileName: 'expired.wav', fileSize: wav.length }), fingerprint('expired'));
            await db.collection<UploadSession>(IntegrationCollections.uploads).updateOne({ _id: expired._id }, { $set: { expiresAt: new Date(0) } }); await processIngestion();
            assert.equal((await ownedUpload(actor, expired._id)).state, 'expired');
            const busy = await createUpload(actor, UploadSchema.parse({ fileName: 'busy.wav', fileSize: wav.length }), fingerprint('busy'));
            await db.collection<UploadSession>(IntegrationCollections.uploads).updateOne({ _id: busy._id }, { $set: { leaseUntil: new Date(Date.now() + 60000) } });
            await assert.rejects(cancelUpload(busy), ApiError);
            await db.collection<UploadSession>(IntegrationCollections.uploads).updateOne({ _id: busy._id }, { $set: { state: 'cancelled', cleanupPending: true } });
            await processIngestion();
            assert.ok((await db.collection(Collections.USERS).findOne({ authSubject: owner }))!.uploadReservations?.[busy._id]);
            await db.collection<UploadSession>(IntegrationCollections.uploads).updateOne({ _id: busy._id }, { $set: { leaseUntil: new Date(0) } });
            await processIngestion();
            assert.equal((await db.collection(Collections.USERS).findOne({ authSubject: owner }))!.uploadReservations?.[busy._id], undefined);
        });
        await t.test('company permission is explicit and is lost immediately after demotion', async () => {
            await db.collection(Collections.SYSTEM_SETTINGS).updateOne({}, { $set: { 'team.enabled': true } });
            await db.collection(Collections.USERS).updateOne({ authSubject: other }, { $set: { role: 'admin' } });
            const company = await createApiToken(other, { name: 'Company CRM', scopes: ['company:recordings:read'] }, db);
            const companyActor = await authenticateApi(new Headers({ Authorization: `Bearer ${company.secret}` }), db);
            assert.equal((await apiRecording(companyActor, recordingId, 'read'))._id.toString(), recordingId);
            await db.collection(Collections.USERS).updateOne({ authSubject: other }, { $set: { role: 'user' } });
            await assert.rejects(apiRecording(await authenticateApi(new Headers({ Authorization: `Bearer ${company.secret}` }), db), recordingId, 'read'), ApiError);
        });
        await t.test('concurrent transcription requests cannot silently replace queued options', async () => {
            const id = `manual:${recordingId}`;
            const attempts = await Promise.allSettled([
                enqueueTranscription(owner, recordingId, { provider: 'soniox' }, id, false, db),
                enqueueTranscription(owner, recordingId, { provider: 'gemini' }, id, false, db),
            ]);
            assert.equal(attempts.filter(attempt => attempt.status === 'fulfilled').length, 1);
            const rejected = attempts.find(attempt => attempt.status === 'rejected');
            assert.ok(rejected?.status === 'rejected' && rejected.reason instanceof ApiError && rejected.reason.code === 'transcription_conflict');
        });
        await t.test('account revocation invalidates a previously valid token', async () => {
            await db.collection(Collections.USERS).updateOne({ authSubject: owner }, { $set: { accessRevokedAt: new Date(Date.now() + 1) } });
            await assert.rejects(authenticateApi(new Headers({ Authorization: `Bearer ${issued.secret}` }), db), ApiError);
            actor = { ...actor, token: { ...actor.token, revokedAt: new Date() } };
        });
        await t.test('account deletion revokes credentials and waits for running processing to settle', async () => {
            await db.collection(Collections.SYSTEM_SETTINGS).updateOne({}, { $set: { 'team.enabled': false } });
            const deleting = new ObjectId().toString(); await ensureUserProfile(deleting, 'deleting@test.invalid');
            const credential = await createApiToken(deleting, { name: 'Deleting client' }, db);
            const jobId = `manual:${new ObjectId()}`;
            const jobs = db.collection<{ _id: string; owner: string; state: string; leaseUntil: Date }>(IntegrationCollections.jobs);
            await jobs.insertOne({ _id: jobId, owner: deleting, state: 'running', leaseUntil: new Date(Date.now() + 60000) });
            const waiting = await deleteUserData(deleting, { db, removeIdentity: async () => {} });
            assert.equal(waiting.cleanupPending, true);
            await assert.rejects(authenticateApi(new Headers({ Authorization: `Bearer ${credential.secret}` }), db), ApiError);
            assert.ok(await db.collection(Collections.USERS).findOne({ authSubject: deleting }));
            await jobs.updateOne({ _id: jobId }, { $set: { state: 'submitted', leaseUntil: new Date(0) } });
            const deleted = await deleteUserData(deleting, { db, removeIdentity: async () => {} });
            assert.equal(deleted.cleanupPending, false);
            assert.equal(await db.collection(Collections.USERS).findOne({ authSubject: deleting }), null);
        });
    } finally {
        t.mock.restoreAll(); await db.dropDatabase(); await client.close();
        for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]; Object.assign(process.env, saved);
    }
});

import { randomUUID } from 'node:crypto';
import { ObjectId, MongoServerError, type Db } from 'mongodb';
import { Collections } from '@/lib/mongodb';
import type { Recording, Contact } from '@/lib/db/types';
import { prepareUploadContext, type PreparedUploadContext } from '@/app/actions/upload/prepare-upload-context';
import { findContactById, findContactByName, findContactByPhone } from '@/lib/db/contacts';
import { buildRecordingDisplayName } from '@/lib/recording-label';
import { generateRecordingKey } from '@/lib/r2';
import { buildRecordingWriteData } from '@/lib/db/recordings/write';
import { reportUsage } from '@/lib/stripe/usage';
import { getTeamSettings } from '@/lib/team-policy';
import { IntegrationCollections, integrationDb } from './database';
import { ApiError, PART_BYTES, SESSION_MS, fingerprint, type UploadInput } from './contracts';
import { activeIntegration, type ApiActor } from './tokens';
import { accountUpload, releaseUpload, reserveUpload } from './accounting';
import { ingestionStorage } from './storage';
import { enqueueTranscription } from './jobs';

export interface UploadSession {
    _id: string; owner: string; integrationId: string; requestKey?: string; fingerprint: string;
    input: UploadInput; prepared: PreparedUploadContext;
    mode: 'direct' | 'simple' | 'legacy'; state: 'initializing' | 'uploading' | 'finalizing' | 'completed' | 'cancelled' | 'expired';
    stagingKey: string; finalKey: string; storageUploadId?: string; recordingId?: string;
    createdAt: Date; expiresAt: Date; leaseUntil: Date; leaseOwner?: string;
    cleanupPending: boolean; errorCode?: string; autoQueued?: boolean;
    verifiedDuration?: number;
    completedAt?: Date;
}
export function uploadResponse(session: UploadSession, parts?: unknown[]) {
    return { id: session._id, state: session.state, fileSize: session.input.fileSize, partSize: PART_BYTES, partCount: Math.ceil(session.input.fileSize / PART_BYTES), expiresAt: session.expiresAt.toISOString(), recordingId: session.recordingId ?? null, ...(parts ? { parts } : {}), ...(session.errorCode ? { errorCode: session.errorCode } : {}) };
}
async function preparedContext(owner: string, input: UploadInput) {
    const prepared = await prepareUploadContext(owner, input.fileName, input.mimeType);
    if ('error' in prepared) throw new ApiError(400, 'unsupported_file', prepared.error);
    let contact = null;
    if (input.contactId) {
        contact = await findContactById(owner, input.contactId);
        if (!contact) throw new ApiError(400, 'invalid_contact', 'Contact does not belong to this account.');
    } else if (input.contactId !== null && input.phoneNumber !== undefined) {
        contact = input.phoneNumber ? await findContactByPhone(owner, input.phoneNumber) : null;
    } else if (input.contactId !== null && input.contactName !== undefined) {
        contact = input.contactName ? await findContactByName(owner, input.contactName) : null;
    } else if (input.contactId === undefined) {
        contact = prepared.contactId ? await findContactById(owner, prepared.contactId) : null;
    }
    prepared.contactId = contact?._id.toString() ?? null;
    if (input.contactId !== undefined || input.phoneNumber !== undefined || input.contactName !== undefined) {
        prepared.contactMatchSource = input.phoneNumber ? 'phone' : input.contactName ? 'name' : undefined;
        prepared.googleContactId = contact?.googleContactId;
    }
    prepared.contactName = input.contactName !== undefined ? input.contactName : contact?.name ?? prepared.contactName;
    prepared.phoneNumber = input.phoneNumber !== undefined ? input.phoneNumber : contact?.phoneNumbers[0] ?? prepared.phoneNumber;
    prepared.recordedAt = input.recordedAt ? new Date(input.recordedAt) : prepared.recordedAt;
    prepared.standardizedDisplayName = buildRecordingDisplayName(prepared, prepared.recordedAt);
    prepared.r2Key = generateRecordingKey(owner, prepared.contactId, prepared.phoneNumber, prepared.recordedAt, prepared.extension);
    return prepared;
}
export async function createUpload(actor: ApiActor, input: UploadInput, requestKey: string, mode: 'direct' | 'simple' = 'direct'): Promise<UploadSession> {
    const db = await integrationDb(); const uploads = db.collection<UploadSession>(IntegrationCollections.uploads);
    const existing = await uploads.findOne({ owner: actor.token.owner, integrationId: actor.token.integrationId, requestKey });
    const signature = fingerprint({ input, mode });
    if (existing) {
        if (existing.fingerprint !== signature) throw new ApiError(409, 'idempotency_conflict', 'This Idempotency-Key was used for a different upload.');
        if (existing.state === 'initializing') return initializeUpload(existing, db);
        if (['expired', 'cancelled'].includes(existing.state)) throw new ApiError(410, 'upload_expired', 'This upload is no longer active. Use a new Idempotency-Key.');
        return existing;
    }
    if (input.externalId) {
        const duplicate = await db.collection<Recording>(Collections.RECORDINGS).findOne({ authSubject: actor.token.owner, 'integration.source': input.source, 'integration.externalId': input.externalId });
        if (duplicate) {
            if (duplicate.integration?.fingerprint !== fingerprint(input)) throw new ApiError(409, 'external_id_conflict', 'The source/external ID already identifies a different recording.');
            return duplicateReceipt(actor, input, requestKey, signature, duplicate, db);
        }
    }
    const prepared = await preparedContext(actor.token.owner, input);
    const id = randomUUID(); const now = new Date();
    const session: UploadSession = { _id: id, owner: actor.token.owner, integrationId: actor.token.integrationId, requestKey, fingerprint: signature, input, prepared, mode, state: 'initializing', stagingKey: `${actor.token.owner}/.uploads/${id}`, finalKey: prepared.r2Key, createdAt: now, expiresAt: new Date(now.getTime() + SESSION_MS), leaseUntil: new Date(0), cleanupPending: false };
    try { await uploads.insertOne(session); }
    catch (error) {
        if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
        return createUpload(actor, input, requestKey, mode);
    }
    return initializeUpload(session, db);
}
async function duplicateReceipt(actor: ApiActor, input: UploadInput, key: string, signature: string, recording: Recording, db: Db): Promise<UploadSession> {
    const now = new Date();
    const session: UploadSession = { _id: randomUUID(), owner: actor.token.owner, integrationId: actor.token.integrationId, requestKey: key, fingerprint: signature, input, prepared: { contactId: recording.contactId?.toString() ?? null, contactName: recording.contactName, phoneNumber: recording.phoneNumber, extension: '', mimeType: recording.mimeType, recordedAt: recording.recordedAt, standardizedDisplayName: recording.standardizedDisplayName, r2Key: recording.r2Key }, mode: 'direct', state: 'completed', recordingId: recording._id.toString(), stagingKey: '', finalKey: recording.r2Key, createdAt: now, expiresAt: new Date(now.getTime() + SESSION_MS), leaseUntil: new Date(0), cleanupPending: false, autoQueued: true };
    try { await db.collection<UploadSession>(IntegrationCollections.uploads).insertOne(session); return session; }
    catch (error) { if (!(error instanceof MongoServerError) || error.code !== 11000) throw error; return createUpload(actor, input, key); }
}
export async function initializeUpload(session: UploadSession, database?: Db) {
    const db = database || await integrationDb();
    const uploads = db.collection<UploadSession>(IntegrationCollections.uploads); const lease = randomUUID();
    const claimed = await uploads.findOneAndUpdate({ _id: session._id, state: 'initializing', leaseUntil: { $lte: new Date() } }, { $set: { leaseOwner: lease, leaseUntil: new Date(Date.now() + 5 * 60_000) } }, { returnDocument: 'after' });
    if (!claimed) throw new ApiError(409, 'upload_busy', 'Upload initialization is in progress.', 5);
    let storageUploadId: string | undefined;
    try {
        await reserveUpload(session.owner, session._id, session.input.fileSize, db);
        if (session.mode !== 'legacy') {
            storageUploadId = await ingestionStorage.create(session.stagingKey, session.prepared.mimeType);
            // Persist the cleanup reference even if access was revoked while
            // the storage provider was creating the multipart upload.
            await uploads.updateOne({ _id: session._id, leaseOwner: lease }, { $set: { storageUploadId } });
        }
        const updated = await uploads.findOneAndUpdate({ _id: session._id, state: 'initializing', leaseOwner: lease }, { $set: { state: 'uploading', ...(storageUploadId ? { storageUploadId } : {}), leaseUntil: new Date(0) }, $unset: { leaseOwner: '' } }, { returnDocument: 'after' });
        if (!updated) { if (storageUploadId) await ingestionStorage.abort(session.stagingKey, storageUploadId); throw new ApiError(410, 'upload_cancelled', 'Upload was cancelled.'); }
        return updated;
    } catch (error) {
        if (storageUploadId) await ingestionStorage.abort(session.stagingKey, storageUploadId).catch(() => {});
        await uploads.updateOne({ _id: session._id, leaseOwner: lease }, { $set: { state: 'cancelled', cleanupPending: true, leaseUntil: new Date(0) }, $unset: { leaseOwner: '' } });
        await releaseUpload(session.owner, session._id, db);
        throw error;
    }
}
export async function ownedUpload(actor: ApiActor, id: string) {
    const session = await (await integrationDb()).collection<UploadSession>(IntegrationCollections.uploads).findOne({ _id: id, owner: actor.token.owner, integrationId: actor.token.integrationId });
    if (!session) throw new ApiError(404, 'not_found', 'Upload not found.');
    return session;
}
export function ensureUploading(session: UploadSession) {
    if (session.expiresAt <= new Date() || ['expired', 'cancelled'].includes(session.state)) throw new ApiError(410, 'upload_expired', 'Upload session expired or was cancelled.');
    if (session.state !== 'uploading') throw new ApiError(409, 'upload_busy', 'Upload is not accepting parts.', 5);
}
export async function cancelUpload(session: UploadSession) {
    const db = await integrationDb();
    if (session.state === 'cancelled' || session.state === 'expired') {
        await cleanupUpload(session, db);
        return uploadResponse(session);
    }
    const result = await db.collection<UploadSession>(IntegrationCollections.uploads).findOneAndUpdate({ _id: session._id, state: { $in: ['initializing', 'uploading'] }, leaseUntil: { $lte: new Date() } }, { $set: { state: 'cancelled', cleanupPending: true } }, { returnDocument: 'after' });
    if (!result) throw new ApiError(409, 'upload_busy', 'A finalized or finalizing upload cannot be cancelled.');
    await cleanupUpload(result, db);
    return uploadResponse(result);
}
export async function completeUpload(session: UploadSession, database?: Db) {
    const db = database || await integrationDb(); const uploads = db.collection<UploadSession>(IntegrationCollections.uploads);
    if (session.state === 'completed') return session;
    if (session.expiresAt <= new Date() && session.state !== 'finalizing') throw new ApiError(410, 'upload_expired', 'Upload session expired.');
    const lease = randomUUID();
    const claimed = await uploads.findOneAndUpdate({ _id: session._id, state: { $in: ['uploading', 'finalizing'] }, leaseUntil: { $lte: new Date() } }, { $set: { state: 'finalizing', leaseOwner: lease, leaseUntil: new Date(Date.now() + 5 * 60_000) } }, { returnDocument: 'after' });
    if (!claimed) throw new ApiError(409, 'upload_busy', 'Upload completion is in progress or unavailable.', 5);
    const heartbeat = setInterval(() => { void uploads.updateOne({ _id: session._id, leaseOwner: lease }, { $set: { leaseUntil: new Date(Date.now() + 5 * 60_000) } }).catch(() => {}); }, 30_000); heartbeat.unref();
    try {
        let recording = await db.collection<Recording>(Collections.RECORDINGS).findOne({ ingestionId: session._id });
        if (!recording) {
            await assertUploadAccess(session, db);
            let head = await ingestionStorage.head(session.finalKey);
            if (!head) {
                let staging = await ingestionStorage.head(session.stagingKey);
                if (!staging && session.storageUploadId) { await ingestionStorage.complete(session.stagingKey, session.storageUploadId, session.input.fileSize); staging = await ingestionStorage.head(session.stagingKey); }
                if (!staging || staging.ContentLength !== session.input.fileSize) throw new ApiError(409, 'size_mismatch', 'Uploaded file size does not match the declared size.');
                if (staging.ContentType?.split(';')[0].toLowerCase() !== session.prepared.mimeType) throw new ApiError(400, 'mime_mismatch', 'Uploaded MIME type does not match initialization.');
                session.verifiedDuration = await ingestionStorage.validate(session.stagingKey, session.prepared.mimeType, session.input.fileSize, staging.ETag);
                await uploads.updateOne({ _id: session._id, leaseOwner: lease }, { $set: { verifiedDuration: session.verifiedDuration } });
                await ingestionStorage.promote(session.stagingKey, session.finalKey, staging.ETag);
                head = await ingestionStorage.head(session.finalKey);
            }
            if (!head || head.ContentLength !== session.input.fileSize) throw new ApiError(409, 'size_mismatch', 'Final object verification failed.');
            const duration = session.verifiedDuration ?? await ingestionStorage.validate(session.finalKey, session.prepared.mimeType, session.input.fileSize);
            // Revalidate contact ownership at completion; contacts can change during transfer.
            const contact = session.prepared.contactId ? await db.collection<Contact>(Collections.CONTACTS).findOne({ _id: new ObjectId(session.prepared.contactId), authSubject: session.owner }) : null;
            const current = await uploads.findOne({ _id: session._id, state: 'finalizing', leaseOwner: lease });
            if (!current) throw new ApiError(409, 'upload_busy', 'Completion lease was lost.', 5);
            await assertUploadAccess(session, db);
            const doc = { ...buildRecordingWriteData({ authSubject: session.owner, contactId: contact?._id ?? null, contactName: session.prepared.contactName, phoneNumber: session.prepared.phoneNumber, contactMatchSource: session.prepared.contactMatchSource, r2Key: session.finalKey, fileName: session.input.fileName, standardizedDisplayName: session.prepared.standardizedDisplayName, fileSize: session.input.fileSize, mimeType: session.prepared.mimeType, duration, recordedAt: session.prepared.recordedAt, transcriptionStatus: 'pending', tags: session.input.tags, isArchived: false, isStarred: false, ingestionId: session._id, integration: { source: session.input.source, externalId: session.input.externalId, metadata: session.input.metadata, fingerprint: fingerprint(session.input) } }, new Date()), _id: new ObjectId() };
            try { await db.collection<Recording>(Collections.RECORDINGS).insertOne(doc); recording = doc; }
            catch (error) {
                if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
                recording = await db.collection<Recording>(Collections.RECORDINGS).findOne({ $or: [{ ingestionId: session._id }, ...(session.input.externalId ? [{ authSubject: session.owner, 'integration.source': session.input.source, 'integration.externalId': session.input.externalId }] : [])] });
                if (!recording || recording.integration?.fingerprint !== fingerprint(session.input)) throw new ApiError(409, 'external_id_conflict', 'The source/external ID already identifies another recording.');
            }
        }
        if (recording.ingestionId === session._id) {
            if (!await uploads.findOne({ _id: session._id, state: 'finalizing', leaseOwner: lease })) throw new ApiError(409, 'upload_busy', 'Completion lease was lost.', 5);
            const user = await accountUpload(session.owner, session._id, recording.fileSize, recording.duration, db);
            if (!user) throw new ApiError(403, 'account_unavailable', 'Account unavailable.');
            await reportUsage(session.owner, 'storage', user.storagePeakUsed);
            await reconcileContact(recording, db);
            const team = await getTeamSettings(db);
            if (!user.disabled && !user.softDelete?.isDeleted && (team.enabled ? team.transcriptionMode === 'automatic' : user.transcriptionSettings.autoTranscribe)) await enqueueTranscription(session.owner, recording._id.toString(), {}, `auto:${session._id}`, true, db);
        } else { await releaseUpload(session.owner, session._id, db); await ingestionStorage.remove(session.finalKey); }
        const completed = await uploads.findOneAndUpdate({ _id: session._id, leaseOwner: lease }, { $set: { state: 'completed', completedAt: new Date(), recordingId: recording._id.toString(), autoQueued: true, cleanupPending: true, leaseUntil: new Date(0) }, $unset: { leaseOwner: '', errorCode: '' } }, { returnDocument: 'after' });
        if (!completed) throw new ApiError(409, 'upload_busy', 'Completion lease was lost.', 5);
        await cleanupUpload(completed, db).catch(() => {});
        return completed;
    } catch (error) {
        const failure = error instanceof ApiError ? error : new ApiError(503, 'storage_unavailable', 'Completion was interrupted. Retry this upload.', 30);
        // Validation failures return to uploading; transient failures keep a durable
        // finalizing checkpoint so cron can recover even if the client disappears.
        await uploads.updateOne({ _id: session._id, leaseOwner: lease }, { $set: { state: failure.code === 'account_unavailable' ? 'cancelled' : failure.status < 500 ? 'uploading' : 'finalizing', ...(failure.code === 'account_unavailable' ? { cleanupPending: true } : {}), errorCode: failure.code, leaseUntil: new Date(Date.now() + (failure.status >= 500 ? 30_000 : 0)) }, $unset: { leaseOwner: '' } });
        throw failure;
    } finally { clearInterval(heartbeat); }
}
async function assertUploadAccess(session: UploadSession, db: Db) {
    const user = session.mode === 'legacy' ? await db.collection<import('@/lib/db/types').User>(Collections.USERS).findOne({ authSubject: session.owner }) : await activeIntegration(session.owner, session.integrationId);
    if (!user || user.disabled || user.softDelete?.isDeleted || user.teamInvitationPending ||
        (session.mode === 'legacy' && user.accessRevokedAt && session.createdAt <= user.accessRevokedAt)) throw new ApiError(403, 'account_unavailable', 'Upload access was revoked.');
}
async function reconcileContact(recording: Recording, db: Db) {
    if (!recording.contactId) return;
    // Rebuildable projection, rather than an increment that can be lost/repeated.
    const [stats] = await db.collection<Recording>(Collections.RECORDINGS).aggregate<{ count: number; last: Date }>([{ $match: { authSubject: recording.authSubject, contactId: recording.contactId } }, { $group: { _id: null, count: { $sum: 1 }, last: { $max: '$recordedAt' } } }]).toArray();
    await db.collection<Contact>(Collections.CONTACTS).updateOne({ _id: recording.contactId, authSubject: recording.authSubject }, { $set: { totalRecordings: stats?.count ?? 0, lastRecordingAt: stats?.last ?? null } });
}
export async function cleanupUpload(session: UploadSession, database?: Db) {
    const db = database || await integrationDb();
    if (session.leaseUntil > new Date()) throw new ApiError(409, 'upload_busy', 'Upload transfer is still settling.', 5);
    if (session.storageUploadId) await ingestionStorage.abort(session.stagingKey, session.storageUploadId);
    if (session.stagingKey) await ingestionStorage.remove(session.stagingKey);
    if (session.state !== 'completed') {
        // Never delete a final object belonging to a persisted recording.
        if (!await db.collection<Recording>(Collections.RECORDINGS).findOne({ r2Key: session.finalKey })) await ingestionStorage.remove(session.finalKey);
        await releaseUpload(session.owner, session._id, db);
    }
    // Legacy PUT URLs can recreate a staging object until their signed lifetime
    // ends. Continue sweeping those keys through the expiry window.
    const sweepAgain = session.mode === 'legacy' && Date.now() < session.createdAt.getTime() + 16 * 60_000;
    await db.collection<UploadSession>(IntegrationCollections.uploads).updateOne({ _id: session._id }, { $set: { cleanupPending: sweepAgain } });
}

/** Adapt the browser/mobile single-PUT contract to durable ingestion without
 * changing its response shape or requiring a new credential. */
export async function registerLegacyUpload(owner: string, prepared: PreparedUploadContext, input: { fileName: string; fileSize: number; mimeType?: string }, existingStagingKey?: string, expiresAt?: Date): Promise<UploadSession> {
    const db = await integrationDb(); const uploads = db.collection<UploadSession>(IntegrationCollections.uploads);
    const id = randomUUID(); const key = fingerprint(existingStagingKey || id);
    const existing = await uploads.findOne({ owner, integrationId: 'legacy', requestKey: key });
    if (existing) return existing;
    const now = new Date(); const metadata: UploadInput = { ...input, tags: [] };
    const session: UploadSession = { _id: id, owner, integrationId: 'legacy', requestKey: key, fingerprint: fingerprint(metadata), input: metadata, prepared, mode: 'legacy', state: 'initializing', stagingKey: existingStagingKey || `${owner}/.uploads/${id}`, finalKey: prepared.r2Key, createdAt: now, expiresAt: expiresAt || new Date(now.getTime() + SESSION_MS), leaseUntil: new Date(0), cleanupPending: false };
    try { await uploads.insertOne(session); }
    catch (error) { if (!(error instanceof MongoServerError) || error.code !== 11000) throw error; return registerLegacyUpload(owner, prepared, input, existingStagingKey, expiresAt); }
    return initializeUpload(session, db);
}

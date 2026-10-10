import 'server-only';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { checkUserAccess } from '@/lib/access-control';
import { getRecordingByR2Key } from '@/lib/db/recordings';
import { findUserByAuthSubject } from '@/lib/db/users';
import { logger } from '@/lib/logger';
import { storageBucket, getPresignClient, generateRecordingKey } from '@/lib/r2';
import { createUploadSessionToken, verifyUploadSessionToken } from '@/lib/upload-session-token';
import { prepareUploadContext, refreshUploadSessionContact } from '@/app/actions/upload/prepare-upload-context';
import { completeUpload, registerLegacyUpload, type UploadSession } from '@/lib/integrations/uploads';
import { IntegrationCollections, integrationDb } from '@/lib/integrations/database';

export interface InitDirectUploadInput {
    fileName: string;
    fileSize: number;
    mimeType?: string;
}

export interface InitDirectUploadResult {
    success: boolean;
    uploadUrl?: string;
    uploadToken?: string;
    headers?: Record<string, string>;
    error?: string;
}

export interface CompleteDirectUploadInput {
    uploadToken: string;
}

export interface CompleteDirectUploadResult {
    success: boolean;
    recordingId?: string;
    error?: string;
}

export interface CompleteDirectUploadForUserResult extends CompleteDirectUploadResult {
    shouldStartAutoTranscription?: boolean;
}


export async function initializeDirectUploadForUser(authSubject: string, input: InitDirectUploadInput): Promise<InitDirectUploadResult> {
    try {
        if (!authSubject) return { success: false, error: 'Not authenticated' };
        if (!input.fileName?.trim()) return { success: false, error: 'Invalid file name' };
        if (!Number.isSafeInteger(input.fileSize) || input.fileSize <= 0 || input.fileSize > 5 * 1024 ** 3) return { success: false, error: 'File size must be between 1 byte and 5 GiB.' };
        const user = await findUserByAuthSubject(authSubject);
        if (!user || !checkUserAccess(user).allowed) return { success: false, error: 'Upload access is unavailable.' };
        const prepared = await prepareUploadContext(authSubject, input.fileName, input.mimeType);
        if ('error' in prepared) return { success: false, error: prepared.error };
        const session = await registerLegacyUpload(authSubject, prepared, input);
        const uploadUrl = await getSignedUrl(getPresignClient(), new PutObjectCommand({ Bucket: storageBucket(), Key: session.stagingKey, ContentType: prepared.mimeType }), { expiresIn: 900 });
        const uploadToken = await createUploadSessionToken({
            authSubject, uploadId: session._id, r2Key: session.stagingKey, fileName: input.fileName, fileSize: input.fileSize,
            mimeType: prepared.mimeType, contactId: prepared.contactId, contactName: prepared.contactName,
            phoneNumber: prepared.phoneNumber, googleContactId: prepared.googleContactId, contactMatchSource: prepared.contactMatchSource,
            recordedAtIso: prepared.recordedAt.toISOString(), standardizedDisplayName: prepared.standardizedDisplayName,
        });
        return { success: true, uploadUrl, uploadToken, headers: { 'Content-Type': prepared.mimeType } };
    } catch (error) {
        logger.error('[directUpload] initialization failed');
        return { success: false, error: error instanceof Error && 'status' in error ? error.message : 'Failed to initialize upload' };
    }
}

export async function completeDirectUploadForUser(authSubject: string, input: CompleteDirectUploadInput): Promise<CompleteDirectUploadForUserResult> {
    try {
        if (!authSubject) return { success: false, error: 'Not authenticated' };
        const payload = await verifyUploadSessionToken(input.uploadToken || '');
        if (!payload || payload.authSubject !== authSubject) return { success: false, error: 'Invalid, expired, or unauthorized upload token' };
        const user = await findUserByAuthSubject(authSubject);
        if (!user || !checkUserAccess(user).allowed ||
            (user.accessRevokedAt && (!payload.iat || payload.iat * 1000 <= user.accessRevokedAt.getTime()))) return { success: false, error: 'Upload access was revoked.' };
        // Previously finalized recordings remain accessible with previously issued tokens.
        const existing = await getRecordingByR2Key(authSubject, payload.r2Key);
        if (existing) return { success: true, recordingId: existing._id.toString(), shouldStartAutoTranscription: false };
        const caller = await refreshUploadSessionContact(authSubject, payload);
        const db = await integrationDb();
        let session = payload.uploadId ? await db.collection<UploadSession>(IntegrationCollections.uploads).findOne({ _id: payload.uploadId, owner: authSubject, integrationId: 'legacy' }) : null;
        if (payload.uploadId && !session) return { success: false, error: 'Upload session unavailable.' };
        if (!session) {
            const recordedAt = new Date(payload.recordedAtIso);
            const extension = payload.fileName.split('.').pop() || 'mp3';
            session = await registerLegacyUpload(authSubject, {
                contactId: caller.contactId, contactName: caller.contactName, phoneNumber: caller.phoneNumber,
                contactMatchSource: caller.contactMatchSource, extension, mimeType: payload.mimeType, recordedAt,
                standardizedDisplayName: caller.standardizedDisplayName,
                r2Key: generateRecordingKey(authSubject, caller.contactId, caller.phoneNumber, recordedAt, extension),
            }, { fileName: payload.fileName, fileSize: payload.fileSize, mimeType: payload.mimeType }, payload.r2Key, new Date((payload.iat || 0) * 1000 + 2 * 60 * 60 * 1000));
        }
        if (session.state === 'uploading') {
            session.prepared = { ...session.prepared, contactId: caller.contactId, contactName: caller.contactName, phoneNumber: caller.phoneNumber, contactMatchSource: caller.contactMatchSource, standardizedDisplayName: caller.standardizedDisplayName };
            await db.collection<UploadSession>(IntegrationCollections.uploads).updateOne({ _id: session._id, state: 'uploading' }, { $set: { prepared: session.prepared } });
        }
        for (let attempt = 0; attempt < 20; attempt++) {
            try {
                const result = await completeUpload(session);
                return { success: true, recordingId: result.recordingId, shouldStartAutoTranscription: false };
            } catch (error) {
                if (!(error instanceof Error) || !('code' in error) || error.code !== 'upload_busy') throw error;
                await new Promise(resolve => setTimeout(resolve, 100));
                session = (await db.collection<UploadSession>(IntegrationCollections.uploads).findOne({ _id: session._id, owner: authSubject }))!;
                if (!session) throw error;
            }
        }
        return { success: false, error: 'Upload completion is still in progress. Retry with the same upload token.' };
    } catch (error) {
        logger.error('[directUpload] completion failed');
        return { success: false, error: error instanceof Error && 'status' in error ? error.message : 'Failed to finalize upload' };
    }
}

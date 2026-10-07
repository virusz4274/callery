import 'server-only';

import { ObjectId } from 'mongodb';
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { checkStorageAccess, checkUserAccess } from '@/lib/access-control';
import { createRecording, getRecordingByR2Key } from '@/lib/db/recordings';
import {
    findUserByAuthSubject,
    incrementStorageUsed,
} from '@/lib/db/users';
import { logger } from '@/lib/logger';
import { getR2ObjectDurationSeconds, storageBucket, getStorageClient, getPresignClient, validateAudioMimeType } from '@/lib/r2';
import { reportUsage } from '@/lib/stripe/usage';
import { createUploadSessionToken, verifyUploadSessionToken } from '@/lib/upload-session-token';
import { prepareUploadContext, refreshUploadSessionContact } from '@/app/actions/upload/prepare-upload-context';

const DIRECT_UPLOAD_MAX_BYTES = 5 * 1024 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 15 * 60;

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

async function updateStorageUsageForUpload(authSubject: string, fileSize: number): Promise<void> {
    const updatedUser = await incrementStorageUsed(authSubject, fileSize);
    if (!updatedUser) {
        return;
    }

    await reportUsage(authSubject, 'storage', updatedUser.storagePeakUsed);
}

export async function initializeDirectUploadForUser(
    authSubject: string,
    input: InitDirectUploadInput
): Promise<InitDirectUploadResult> {
    try {
        if (!authSubject) {
            return { success: false, error: 'Not authenticated' };
        }

        if (!input.fileName?.trim()) {
            return { success: false, error: 'Invalid file name' };
        }

        if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) {
            return { success: false, error: 'Invalid file size' };
        }

        if (input.fileSize > DIRECT_UPLOAD_MAX_BYTES) {
            return {
                success: false,
                error: 'File exceeds max size of 5 GiB for direct upload. Please split the file first.',
            };
        }

        const user = await findUserByAuthSubject(authSubject);
        if (!user) {
            return { success: false, error: 'User not found' };
        }

        const generalAccess = checkUserAccess(user);
        if (!generalAccess.allowed) {
            return { success: false, error: generalAccess.reason || 'Access denied' };
        }

        const storageAccess = checkStorageAccess(user, input.fileSize);
        if (!storageAccess.allowed) {
            return { success: false, error: storageAccess.reason || 'Storage limit exceeded' };
        }

        const prepared = await prepareUploadContext(authSubject, input.fileName, input.mimeType);
        if ('error' in prepared) {
            return { success: false, error: prepared.error };
        }

        const uploadUrl = await getSignedUrl(
            getPresignClient(),
            new PutObjectCommand({
                Bucket: storageBucket(),
                Key: prepared.r2Key,
                ContentType: prepared.mimeType,
            }),
            { expiresIn: SIGNED_URL_TTL_SECONDS }
        );

        const uploadToken = await createUploadSessionToken({
            authSubject,
            r2Key: prepared.r2Key,
            fileName: input.fileName,
            fileSize: input.fileSize,
            mimeType: prepared.mimeType,
            contactId: prepared.contactId,
            contactName: prepared.contactName,
            phoneNumber: prepared.phoneNumber,
            googleContactId: prepared.googleContactId,
            contactMatchSource: prepared.contactMatchSource,
            recordedAtIso: prepared.recordedAt.toISOString(),
            standardizedDisplayName: prepared.standardizedDisplayName,
        });

        return {
            success: true,
            uploadUrl,
            uploadToken,
            headers: {
                'Content-Type': prepared.mimeType,
            },
        };
    } catch (error) {
        logger.error('[directUpload] initializeDirectUpload failed:', error);
        return { success: false, error: 'Failed to initialize upload' };
    }
}

export async function completeDirectUploadForUser(
    authSubject: string,
    input: CompleteDirectUploadInput
): Promise<CompleteDirectUploadForUserResult> {
    try {
        if (!authSubject) {
            return { success: false, error: 'Not authenticated' };
        }

        if (!input.uploadToken?.trim()) {
            return { success: false, error: 'Missing upload token' };
        }

        const payload = await verifyUploadSessionToken(input.uploadToken);
        if (!payload) {
            return { success: false, error: 'Invalid or expired upload token' };
        }

        if (payload.authSubject !== authSubject) {
            return { success: false, error: 'Upload token does not belong to the current user' };
        }

        const user = await findUserByAuthSubject(authSubject);
        if (!user) {
            return { success: false, error: 'User not found' };
        }

        const generalAccess = checkUserAccess(user);
        if (!generalAccess.allowed) {
            return { success: false, error: generalAccess.reason || 'Access denied' };
        }

        const existing = await getRecordingByR2Key(authSubject, payload.r2Key);
        if (existing) {
            return {
                success: true,
                recordingId: existing._id.toString(),
                shouldStartAutoTranscription: false,
            };
        }

        const head = await getStorageClient().send(
            new HeadObjectCommand({
                Bucket: storageBucket(),
                Key: payload.r2Key,
            })
        );

        const uploadedSize = Number(head.ContentLength || 0);
        if (uploadedSize <= 0) {
            return { success: false, error: 'Uploaded file not found or empty in storage' };
        }

        if (uploadedSize !== payload.fileSize) {
            return {
                success: false,
                error: `Uploaded file size mismatch. Expected ${payload.fileSize}, received ${uploadedSize}.`,
            };
        }

        const effectiveMimeType = (head.ContentType || payload.mimeType || 'audio/mpeg').toLowerCase();
        if (!validateAudioMimeType(effectiveMimeType)) {
            return { success: false, error: `Invalid uploaded MIME type: ${effectiveMimeType}` };
        }

        const storageAccess = checkStorageAccess(user, uploadedSize);
        if (!storageAccess.allowed) {
            return { success: false, error: storageAccess.reason || 'Storage limit exceeded' };
        }

        const recordedAt = new Date(payload.recordedAtIso);
        if (Number.isNaN(recordedAt.getTime())) {
            return { success: false, error: 'Invalid recording date in upload token' };
        }

        const duration = await getR2ObjectDurationSeconds(payload.r2Key, effectiveMimeType, uploadedSize);

        const caller = await refreshUploadSessionContact(authSubject, payload);
        const createdRecording = await createRecording({
            authSubject,
            contactId: caller.contactId ? new ObjectId(caller.contactId) : null,
            contactName: caller.contactName,
            phoneNumber: caller.phoneNumber,
            contactMatchSource: caller.contactMatchSource,
            r2Key: payload.r2Key,
            fileName: payload.fileName,
            standardizedDisplayName: caller.standardizedDisplayName,
            fileSize: uploadedSize,
            mimeType: effectiveMimeType,
            duration: Math.round(duration),
            recordedAt,
            transcriptionStatus: 'pending' as const,
            tags: [],
            isStarred: false,
            isArchived: false,
        });

        await updateStorageUsageForUpload(authSubject, uploadedSize);

        logger.info(`[directUpload] Completed: ${payload.fileName} -> ${payload.r2Key}`);

        return {
            success: true,
            recordingId: createdRecording._id.toString(),
            shouldStartAutoTranscription: user.transcriptionSettings.autoTranscribe,
        };
    } catch (error) {
        logger.error('[directUpload] completeDirectUpload failed:', error);
        return { success: false, error: 'Failed to finalize upload' };
    }
}

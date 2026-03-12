'use server';

import { ObjectId } from 'mongodb';
import { after } from 'next/server';
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getFirebaseUidFromSession } from '@/lib/auth-utils';
import { checkStorageAccess, checkUserAccess } from '@/lib/access-control';
import { createRecording, getRecordingByR2Key } from '@/lib/db/recordings';
import {
    bumpStoragePeakUsed,
    checkAndResetUsageCycle,
    findUserByFirebaseUid,
    incrementStorageUsed,
    setStoragePeakUsed,
} from '@/lib/db/users';
import { logger } from '@/lib/logger';
import { getR2ObjectDurationSeconds, R2_BUCKET, r2Client, validateAudioMimeType } from '@/lib/r2';
import { reportUsage } from '@/lib/stripe/usage';
import { createUploadSessionToken, verifyUploadSessionToken } from '@/lib/upload-session-token';
import { prepareUploadContext } from './prepare-upload-context';
import { triggerAutoTranscription } from './transcription';

const DIRECT_UPLOAD_MAX_BYTES = 5 * 1024 * 1024 * 1024; // 5 GiB (single PUT limit)
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

async function updateStorageUsageForUpload(firebaseUid: string, fileSize: number): Promise<void> {
    const updatedUser = await incrementStorageUsed(firebaseUid, fileSize);
    if (!updatedUser) {
        return;
    }

    const currentStorage = updatedUser.storageUsed || 0;
    const currentPeak = updatedUser.storagePeakUsed || 0;
    const periodEnd = updatedUser.stripeCurrentPeriodEnd ? new Date(updatedUser.stripeCurrentPeriodEnd) : undefined;
    const peakPeriodEnd = updatedUser.storagePeakPeriodEnd ? new Date(updatedUser.storagePeakPeriodEnd) : undefined;
    const periodMismatch = periodEnd && (!peakPeriodEnd || periodEnd.getTime() !== peakPeriodEnd.getTime());

    if (periodMismatch) {
        await setStoragePeakUsed(firebaseUid, currentStorage, periodEnd);
        await reportUsage(firebaseUid, 'storage', currentStorage);
        return;
    }

    if (currentStorage > currentPeak) {
        const updated = await bumpStoragePeakUsed(firebaseUid, currentStorage, periodEnd);
        if (updated) {
            await reportUsage(firebaseUid, 'storage', currentStorage);
        }
    }
}

export async function initializeDirectUpload(input: InitDirectUploadInput): Promise<InitDirectUploadResult> {
    try {
        const firebaseUid = await getFirebaseUidFromSession();
        if (!firebaseUid) {
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

        const user = await findUserByFirebaseUid(firebaseUid);
        if (!user) {
            return { success: false, error: 'User not found' };
        }

        const generalAccess = checkUserAccess(user);
        if (!generalAccess.allowed) {
            return { success: false, error: generalAccess.reason || 'Access denied' };
        }

        const currentUser = await checkAndResetUsageCycle(user);
        const storageAccess = checkStorageAccess(currentUser, input.fileSize);
        if (!storageAccess.allowed) {
            return { success: false, error: storageAccess.reason || 'Storage limit exceeded' };
        }

        const prepared = await prepareUploadContext(firebaseUid, input.fileName, input.mimeType);
        if ('error' in prepared) {
            return { success: false, error: prepared.error };
        }

        const uploadUrl = await getSignedUrl(
            r2Client,
            new PutObjectCommand({
                Bucket: R2_BUCKET,
                Key: prepared.r2Key,
                ContentType: prepared.mimeType,
            }),
            { expiresIn: SIGNED_URL_TTL_SECONDS }
        );

        const uploadToken = await createUploadSessionToken({
            firebaseUid,
            r2Key: prepared.r2Key,
            fileName: input.fileName,
            fileSize: input.fileSize,
            mimeType: prepared.mimeType,
            contactId: prepared.contactId,
            contactName: prepared.contactName,
            phoneNumber: prepared.phoneNumber,
            googleContactId: prepared.googleContactId,
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

export async function completeDirectUpload(input: CompleteDirectUploadInput): Promise<CompleteDirectUploadResult> {
    try {
        const firebaseUid = await getFirebaseUidFromSession();
        if (!firebaseUid) {
            return { success: false, error: 'Not authenticated' };
        }

        if (!input.uploadToken?.trim()) {
            return { success: false, error: 'Missing upload token' };
        }

        const payload = await verifyUploadSessionToken(input.uploadToken);
        if (!payload) {
            return { success: false, error: 'Invalid or expired upload token' };
        }

        if (payload.firebaseUid !== firebaseUid) {
            return { success: false, error: 'Upload token does not belong to the current user' };
        }

        const user = await findUserByFirebaseUid(firebaseUid);
        if (!user) {
            return { success: false, error: 'User not found' };
        }

        const generalAccess = checkUserAccess(user);
        if (!generalAccess.allowed) {
            return { success: false, error: generalAccess.reason || 'Access denied' };
        }

        const existing = await getRecordingByR2Key(firebaseUid, payload.r2Key);
        if (existing) {
            return { success: true, recordingId: existing._id.toString() };
        }

        const head = await r2Client.send(
            new HeadObjectCommand({
                Bucket: R2_BUCKET,
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

        const currentUser = await checkAndResetUsageCycle(user);
        const storageAccess = checkStorageAccess(currentUser, uploadedSize);
        if (!storageAccess.allowed) {
            return { success: false, error: storageAccess.reason || 'Storage limit exceeded' };
        }

        const recordedAt = new Date(payload.recordedAtIso);
        if (Number.isNaN(recordedAt.getTime())) {
            return { success: false, error: 'Invalid recording date in upload token' };
        }

        const duration = await getR2ObjectDurationSeconds(payload.r2Key, effectiveMimeType, uploadedSize);

        const createdRecording = await createRecording({
            firebaseUid,
            contactId: payload.contactId ? new ObjectId(payload.contactId) : null,
            contactName: payload.contactName,
            phoneNumber: payload.phoneNumber,
            r2Key: payload.r2Key,
            fileName: payload.fileName,
            standardizedDisplayName: payload.standardizedDisplayName,
            fileSize: uploadedSize,
            mimeType: effectiveMimeType,
            duration: Math.round(duration),
            recordedAt,
            transcriptionStatus: 'pending' as const,
            tags: [],
            isStarred: false,
            isArchived: false,
        });

        await updateStorageUsageForUpload(firebaseUid, uploadedSize);

        after(async () => {
            await triggerAutoTranscription(
                firebaseUid,
                createdRecording._id.toString(),
                payload.r2Key,
                Math.round(duration),
                uploadedSize,
                payload.fileName,
                payload.standardizedDisplayName
            );
        });

        logger.info(`[directUpload] Completed: ${payload.fileName} -> ${payload.r2Key}`);

        return {
            success: true,
            recordingId: createdRecording._id.toString(),
        };
    } catch (error) {
        logger.error('[directUpload] completeDirectUpload failed:', error);
        return { success: false, error: 'Failed to finalize upload' };
    }
}

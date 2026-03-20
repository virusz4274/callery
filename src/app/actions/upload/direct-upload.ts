'use server';

import { after } from 'next/server';
import { getFirebaseUidFromSession } from '@/lib/auth-utils';
import {
    completeDirectUploadForUser,
    initializeDirectUploadForUser,
    type CompleteDirectUploadInput,
    type CompleteDirectUploadResult,
    type InitDirectUploadInput,
    type InitDirectUploadResult,
} from '@/lib/direct-upload-service';
import { logger } from '@/lib/logger';
import { startAutoTranscriptionForRecording } from './transcription';

export async function initializeDirectUpload(input: InitDirectUploadInput): Promise<InitDirectUploadResult> {
    const firebaseUid = await getFirebaseUidFromSession();
    if (!firebaseUid) {
        return { success: false, error: 'Not authenticated' };
    }

    return initializeDirectUploadForUser(firebaseUid, input);
}

export async function completeDirectUpload(input: CompleteDirectUploadInput): Promise<CompleteDirectUploadResult> {
    const firebaseUid = await getFirebaseUidFromSession();
    if (!firebaseUid) {
        return { success: false, error: 'Not authenticated' };
    }

    const { shouldStartAutoTranscription, ...result } = await completeDirectUploadForUser(firebaseUid, input);

    const recordingId = result.success ? result.recordingId : undefined;

    if (recordingId && shouldStartAutoTranscription) {
        after(async () => {
            try {
                await startAutoTranscriptionForRecording(firebaseUid, recordingId);
            } catch (error) {
                logger.error('[directUpload] after() auto-transcription failed:', error);
            }
        });
    }

    return result;
}

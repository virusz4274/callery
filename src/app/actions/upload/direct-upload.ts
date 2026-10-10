'use server';

import { after } from 'next/server';
import { getAuthSubjectFromSession } from '@/lib/auth-utils';
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
import { processTranscriptionJobs } from '@/lib/integrations/jobs';

export async function initializeDirectUpload(input: InitDirectUploadInput): Promise<InitDirectUploadResult> {
    const authSubject = await getAuthSubjectFromSession();
    if (!authSubject) {
        return { success: false, error: 'Not authenticated' };
    }

    return initializeDirectUploadForUser(authSubject, input);
}

export async function completeDirectUpload(input: CompleteDirectUploadInput): Promise<CompleteDirectUploadResult> {
    const authSubject = await getAuthSubjectFromSession();
    if (!authSubject) {
        return { success: false, error: 'Not authenticated' };
    }

    const { shouldStartAutoTranscription, ...result } = await completeDirectUploadForUser(authSubject, input);

    const recordingId = result.success ? result.recordingId : undefined;
    if (recordingId) after(async () => { await processTranscriptionJobs(); });

    if (recordingId && shouldStartAutoTranscription) {
        after(async () => {
            try {
                await startAutoTranscriptionForRecording(authSubject, recordingId);
            } catch (error) {
                logger.error('[directUpload] after() auto-transcription failed:', error);
            }
        });
    }

    return result;
}

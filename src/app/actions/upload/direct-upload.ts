'use server';

import { getFirebaseUidFromSession } from '@/lib/auth-utils';
import {
    completeDirectUploadForUser,
    initializeDirectUploadForUser,
    type CompleteDirectUploadInput,
    type CompleteDirectUploadResult,
    type InitDirectUploadInput,
    type InitDirectUploadResult,
} from '@/lib/direct-upload-service';

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

    return completeDirectUploadForUser(firebaseUid, input);
}

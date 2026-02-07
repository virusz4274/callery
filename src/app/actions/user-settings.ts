'use server';

import { getFirebaseUidFromSession } from '@/lib/auth-utils';
import { findUserByFirebaseUid, updateUser } from '@/lib/db/users';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';
import { TranscriptionProviderId } from '@/services/transcription/factory';

export async function updateTranscriptionSettings(data: {
    autoTranscribe?: boolean;
    defaultProvider?: TranscriptionProviderId;
    defaultModel?: string;
}): Promise<{ success: boolean; error?: string }> {
    const firebaseUid = await getFirebaseUidFromSession();
    if (!firebaseUid) {
        return { success: false, error: 'Unauthorized' };
    }

    try {
        const user = await findUserByFirebaseUid(firebaseUid);
        if (!user) {
            return { success: false, error: 'User not found' };
        }

        const currentSettings = user.transcriptionSettings || { autoTranscribe: true };

        await updateUser(firebaseUid, {
            transcriptionSettings: {
                ...currentSettings,
                ...data,
            }
        });

        logger.info(`[Settings] Updated transcription settings for ${firebaseUid}:`, data);
        revalidatePath('/settings');
        return { success: true };

    } catch (error) {
        logger.error('[Settings] Failed to update transcription settings:', error);
        return { success: false, error: 'Failed to update settings' };
    }
}

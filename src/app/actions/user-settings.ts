'use server';

import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { findUserByAuthSubject, updateUser } from '@/lib/db/users';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';
import { TranscriptionProviderId } from '@/services/transcription/factory';

export async function updateTranscriptionSettings(data: {
    autoTranscribe?: boolean;
    defaultProvider?: TranscriptionProviderId;
    defaultModel?: string;
}): Promise<{ success: boolean; error?: string }> {
    const authSubject = await getAuthSubjectFromSession();
    if (!authSubject) {
        return { success: false, error: 'Unauthorized' };
    }

    try {
        const user = await findUserByAuthSubject(authSubject);
        if (!user) {
            return { success: false, error: 'User not found' };
        }

        const currentSettings = user.transcriptionSettings || { autoTranscribe: true };

        await updateUser(authSubject, {
            transcriptionSettings: {
                ...currentSettings,
                ...data,
            }
        });

        logger.info(`[Settings] Updated transcription settings for ${authSubject}:`, data);
        revalidatePath('/settings');
        return { success: true };

    } catch (error) {
        logger.error('[Settings] Failed to update transcription settings:', error);
        return { success: false, error: 'Failed to update settings' };
    }
}

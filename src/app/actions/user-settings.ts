'use server';

import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { updateUserProfile } from '@/lib/db/users';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';
import { TranscriptionProviderId } from '@/services/transcription/factory';
import { TranscriptionSettingsSchema } from '@/lib/schemas';

export async function updateTranscriptionSettings(data: {
    autoTranscribe?: boolean;
    defaultProvider?: TranscriptionProviderId;
    defaultModel?: string;
}): Promise<{ success: boolean; error?: string }> {
    const authSubject = await getAuthSubjectFromSession();
    if (!authSubject) {
        return { success: false, error: 'Unauthorized' };
    }

    const parsed = TranscriptionSettingsSchema.partial().strict().safeParse(data);
    if (!parsed.success) {
        return { success: false, error: 'Invalid transcription settings' };
    }

    try {
        const user = await updateUserProfile(authSubject, { transcriptionSettings: parsed.data });
        if (!user) {
            return { success: false, error: 'User not found' };
        }

        logger.info(`[Settings] Updated transcription settings for ${authSubject}:`, data);
        revalidatePath('/settings');
        return { success: true };

    } catch (error) {
        logger.error('[Settings] Failed to update transcription settings:', error);
        return { success: false, error: 'Failed to update settings' };
    }
}

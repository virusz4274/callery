'use server';

import { deleteUserData } from '@/lib/db/delete-user-data';
import { logSystemEvent } from '@/lib/db/system-log';
import { getAuthSubjectFromSession } from '@/lib/auth-utils';

/**
 * Delete the current user's own account and all associated data
 * (recordings, audio files, contacts, subscription). Irreversible.
 */
export async function deleteOwnAccount(): Promise<{ success: boolean; message: string }> {
    const authSubject = await getAuthSubjectFromSession();

    if (!authSubject) {
        return { success: false, message: 'Not authenticated' };
    }

    try {
        const result = await deleteUserData(authSubject);

        await logSystemEvent('USER_SELF_DELETE', {
            deletedUserEmail: result.email,
            recordingsDeleted: result.recordingsDeleted,
            r2Failures: result.r2Failures,
            stripeSubscriptionCanceled: result.stripeSubscriptionCanceled,
        });

        if (result.r2Failures.length > 0 || result.stripeCancelError) {
            return {
                success: true,
                message: 'Account deleted. Some cleanup steps need admin attention — support has been notified via the audit log.',
            };
        }

        return { success: true, message: 'Your account and all data have been permanently deleted.' };
    } catch (error) {
        console.error('Error deleting own account:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to delete account',
        };
    }
}

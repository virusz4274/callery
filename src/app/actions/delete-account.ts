'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { deleteUserData } from '@/lib/db/delete-user-data';
import { logSystemEvent } from '@/lib/db/system-log';
import { getAuth } from '@/lib/auth/server';
import { findUserByAuthSubject } from '@/lib/db/users';
import { logger } from '@/lib/logger';
import { AccountClosurePolicyError, hasRecentAccountClosureLogin, type AccountClosureInput, type AccountClosureResult } from '@/lib/account-closure';

const ConfirmationSchema = z.object({
    expectedAuthSubject: z.string().min(1).max(200),
    confirmationEmail: z.string().trim().email().max(320),
}).strict();

/** Close only the freshly authenticated account, preserving pending cleanup. */
export async function deleteOwnAccount(input: AccountClosureInput): Promise<AccountClosureResult> {
    try {
        const session = await (await getAuth()).api.getSession({ headers: await headers() });
        if (!session?.user || !hasRecentAccountClosureLogin(session.session.createdAt)) {
            return { status: 'reauth_required', message: 'Sign in again before permanently deleting your account.' };
        }
        const parsed = ConfirmationSchema.safeParse(input);
        if (!parsed.success || parsed.data.expectedAuthSubject !== session.user.id
            || parsed.data.confirmationEmail.toLowerCase() !== session.user.email.toLowerCase()) {
            return { status: 'blocked', message: 'Confirm the email address of the account currently signed in.' };
        }
        const profile = await findUserByAuthSubject(session.user.id);
        if (!profile || profile.disabled || profile.softDelete?.isDeleted || profile.teamInvitationPending) {
            return { status: 'blocked', message: 'This account cannot be closed from Settings. Contact the administrator.' };
        }

        const result = await deleteUserData(session.user.id);
        try {
            await logSystemEvent('USER_SELF_DELETE', {
                recordingsDeleted: result.recordingsDeleted,
                storageFailures: result.r2Failures.length,
                cleanupPending: result.cleanupPending,
            }, session.user.id);
        } catch (error) { logger.error('Account closure accepted; audit logging failed:', error); }

        return result.cleanupPending
            ? { status: 'cleanup_pending', message: 'Your account closure was accepted and access has been disabled. Remaining cleanup will continue automatically.' }
            : { status: 'deleted', message: 'Your account and recording library have been permanently deleted.' };
    } catch (error) {
        if (error instanceof AccountClosurePolicyError) return { status: 'blocked', message: error.message };
        logger.error('Account closure could not be accepted:', error);
        return { status: 'error', message: 'Account closure could not be completed. Please try again.' };
    }
}

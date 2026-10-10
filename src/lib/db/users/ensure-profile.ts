import type { User } from '../types';
import { isBootstrapAdminEmail } from '@/lib/admin-bootstrap';
import { assertSignupAllowed, acceptTeamInvitation } from '@/lib/team-invitations';
import { getTeamSettings } from '@/lib/team-policy';
import { createUser, findUserByAuthSubject, getRequiredDefaultPlan, updateUser } from './lookup';

/**
 * Ensure a user profile exists, creating one if necessary.
 * Called after Better Auth signup, verification, and login.
 */
export async function ensureUserProfile(
    authSubject: string,
    email: string,
    displayName?: string,
    photoURL?: string,
    emailVerified?: boolean
): Promise<{ user: User; wasCreated: boolean }> {
    let existingUser = await findUserByAuthSubject(authSubject);

    if (existingUser) {
        if (existingUser.teamInvitationPending && emailVerified === true) {
            await acceptTeamInvitation(email, authSubject);
            const activated = await updateUser(authSubject, { teamInvitationPending: false });
            if (activated) existingUser = activated;
        }
        if (!existingUser.disabled && !existingUser.softDelete?.isDeleted && emailVerified && isBootstrapAdminEmail(email) && existingUser.role !== 'admin') {
            const promoted = await updateUser(authSubject, { role: 'admin' });
            if (promoted) return { user: promoted, wasCreated: false };
        }
        return { user: existingUser, wasCreated: false };
    }

    await assertSignupAllowed(email, authSubject);
    const team = await getTeamSettings();
    if (team.enabled && emailVerified === true) await acceptTeamInvitation(email, authSubject);

    const defaultPlan = await getRequiredDefaultPlan();

    const nameParts = (displayName || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    try {
        const newUser = await createUser({
            authSubject,
            email,
            firstName,
            lastName,
            name: displayName || email.split('@')[0],
            phoneNumber: '',
            photoURL: photoURL || '',
            role: isBootstrapAdminEmail(email) && emailVerified === true ? 'admin' : 'user',
            ...(team.enabled ? { teamInvitationPending: emailVerified !== true } : {}),
            planKey: defaultPlan.key,
            timezone: '',
            notificationSettings: {
                activityDigest: 'weekly',
                ingestSuccess: true,
                ingestFail: true,
            },
            transcriptionSettings: {
                autoTranscribe: team.enabled ? team.transcriptionMode === 'automatic' : true,
            },
            storageSettings: {
                deletionPolicy: 'never',
            },
            billingSettings: {
                allowOverage: false,
            },
            storageUsed: 0,
            storageAllocation: defaultPlan.limits.storage,
            storagePeakUsed: 0,
            transcriptionUsed: 0,
            transcriptionAllocation: defaultPlan.limits.transcription,
            totalContacts: 0,
            totalRecordings: 0,
            totalDuration: 0,
            trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            lastLoginAt: new Date(),
            googleSync: {
                status: 'not_connected',
                lastError: null,
            },
        });

        return { user: newUser, wasCreated: true };
    } catch (error: unknown) {
        const err = error as { code?: number; message?: string };
        if (err.code === 11000 || err.message?.includes('E11000') || err.message?.includes('duplicate key')) {
            const user = await findUserByAuthSubject(authSubject);
            if (user) {
                return { user, wasCreated: false };
            }
        }

        throw error;
    }
}

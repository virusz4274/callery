import type { User } from '../types';
import { isBootstrapAdminEmail } from '@/lib/admin-bootstrap';
import { createUser, findUserByAuthSubject, getRequiredDefaultPlan, getRequiredSystemSettings, updateUser } from './lookup';

/**
 * Ensure a user profile exists, creating one if necessary.
 * This is called after Firebase Auth login.
 */
export async function ensureUserProfile(
    authSubject: string,
    email: string,
    displayName?: string,
    photoURL?: string,
    provider: 'firebase' | 'local' = 'firebase',
    emailVerified?: boolean
): Promise<{ user: User; wasCreated: boolean }> {
    const existingUser = await findUserByAuthSubject(authSubject);

    if (existingUser) {
        if (!existingUser.disabled && emailVerified && isBootstrapAdminEmail(email) && existingUser.role !== 'admin') {
            const promoted = await updateUser(authSubject, { role: 'admin' });
            if (promoted) return { user: promoted, wasCreated: false };
        }
        return { user: existingUser, wasCreated: false };
    }

    const settings = await getRequiredSystemSettings();

    if (settings && !settings.allowSignups) {
        throw new Error('New signups are currently disabled.');
    }

    const defaultPlan = await getRequiredDefaultPlan();

    const nameParts = (displayName || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    try {
        const newUser = await createUser({
            authSubject,
            authProvider: provider,
            email,
            firstName,
            lastName,
            name: displayName || email.split('@')[0],
            phoneNumber: '',
            photoURL: photoURL || '',
            role: isBootstrapAdminEmail(email) && emailVerified === true ? 'admin' : 'user',
            planKey: defaultPlan.key,
            timezone: '',
            notificationSettings: {
                activityDigest: 'weekly',
                ingestSuccess: true,
                ingestFail: true,
            },
            transcriptionSettings: {
                autoTranscribe: true,
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

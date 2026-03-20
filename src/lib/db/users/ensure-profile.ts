import type { User } from '../types';
import { isBootstrapAdminEmail } from '@/lib/admin-bootstrap';
import { createUser, findUserByFirebaseUid, getRequiredDefaultPlan, getRequiredSystemSettings } from './lookup';

/**
 * Ensure a user profile exists, creating one if necessary.
 * This is called after Firebase Auth login.
 */
export async function ensureUserProfile(
    firebaseUid: string,
    email: string,
    displayName?: string,
    photoURL?: string
): Promise<{ user: User; wasCreated: boolean }> {
    const existingUser = await findUserByFirebaseUid(firebaseUid);

    if (existingUser) {
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
            firebaseUid,
            email,
            firstName,
            lastName,
            name: displayName || email.split('@')[0],
            phoneNumber: '',
            photoURL: photoURL || '',
            role: isBootstrapAdminEmail(email) ? 'admin' : 'user',
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
            const user = await findUserByFirebaseUid(firebaseUid);
            if (user) {
                return { user, wasCreated: false };
            }
        }

        throw error;
    }
}

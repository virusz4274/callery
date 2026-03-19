import type { User } from '../types';
import { createUser, findUserByFirebaseUid, getPlanById, getSystemSettings } from './lookup';

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

    const settings = await getSystemSettings();

    if (settings && !settings.allowSignups) {
        throw new Error('New signups are currently disabled.');
    }

    let planName = 'Free Trial';
    let storageAllocation = 5 * 1024 * 1024 * 1024;
    let transcriptionAllocation = 3600;

    if (settings?.defaultPlanId) {
        const defaultPlan = await getPlanById(settings.defaultPlanId);
        if (defaultPlan) {
            planName = defaultPlan.name;
            storageAllocation = defaultPlan.limits.storage;
            transcriptionAllocation = defaultPlan.limits.transcription;
        }
    }

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
            role: 'user',
            plan: planName,
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
            storageAllocation,
            storagePeakUsed: 0,
            transcriptionUsed: 0,
            transcriptionAllocation,
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

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { findUserByAuthSubject, updateUser } from '@/lib/db/users';


/**
 * GET /api/user/profile
 * 
 * Get the current user's profile from MongoDB.
 */
export async function GET(request: NextRequest) {
    const authSubject = await getUserFromRequest(request);

    if (!authSubject) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const user = await findUserByAuthSubject(authSubject);

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Update lastLoginAt if it's been more than 1 hour
        const now = new Date();
        if (!user.lastLoginAt || (now.getTime() - user.lastLoginAt.getTime() > 60 * 60 * 1000)) {
            // we don't await this to keep the response fast (fire & forget-ish)
            updateUser(authSubject, { lastLoginAt: now }).catch(err =>
                console.error('Failed to update lastLoginAt:', err)
            );
            // Update local user object for current response correctness
            user.lastLoginAt = now;
        }

        // Convert to response format
        const profile = {
            id: user._id.toString(),
            authSubject: user.authSubject,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            name: user.name,
            phoneNumber: user.phoneNumber,
            createdAt: user.createdAt.toISOString(),
            role: user.role,
            plan: user.plan,
            timezone: user.timezone,
            // Settings
            notificationSettings: user.notificationSettings,
            storageSettings: user.storageSettings,
            transcriptionSettings: user.transcriptionSettings,
            billingSettings: user.billingSettings,
            // Usage
            storageUsed: user.storageUsed,
            storageAllocation: user.storageAllocation,
            transcriptionUsed: user.transcriptionUsed,
            transcriptionAllocation: user.transcriptionAllocation,
            totalRecordings: user.totalRecordings,
            // Billing Status
            stripeSubscriptionStatus: user.stripeSubscriptionStatus,
            trialEndsAt: user.trialEndsAt?.toISOString(),
            lastLoginAt: user.lastLoginAt?.toISOString(),
        };

        return NextResponse.json({ profile });
    } catch (error) {
        console.error('Error fetching user profile:', error);
        return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns an error message when nested settings are malformed, else null. */
async function validateProfileSettings(updateData: Record<string, unknown>): Promise<string | null> {
    if ('notificationSettings' in updateData) {
        const value = updateData.notificationSettings;
        if (!isRecord(value)) return 'Invalid notificationSettings';
        if ('activityDigest' in value && !['off', 'weekly', 'monthly'].includes(value.activityDigest as string)) {
            return 'Invalid notificationSettings.activityDigest';
        }
        for (const key of ['ingestSuccess', 'ingestFail'] as const) {
            if (key in value && typeof value[key] !== 'boolean') {
                return `Invalid notificationSettings.${key}`;
            }
        }
    }
    if ('storageSettings' in updateData) {
        const value = updateData.storageSettings;
        if (!isRecord(value)) return 'Invalid storageSettings';
        if ('deletionPolicy' in value && !['never', '3m', '6m', '1y'].includes(value.deletionPolicy as string)) {
            return 'Invalid storageSettings.deletionPolicy';
        }
    }
    if ('transcriptionSettings' in updateData) {
        const value = updateData.transcriptionSettings;
        if (!isRecord(value)) return 'Invalid transcriptionSettings';
        if ('autoTranscribe' in value && typeof value.autoTranscribe !== 'boolean') {
            return 'Invalid transcriptionSettings.autoTranscribe';
        }
        if ('provider' in value && value.provider !== undefined &&
            !['soniox', 'elevenlabs', 'gemini', 'openai_compat'].includes(value.provider as string)) {
            return 'Invalid transcriptionSettings.provider';
        }
    }
    for (const key of ['firstName', 'lastName', 'phoneNumber', 'timezone'] as const) {
        if (key in updateData && typeof updateData[key] !== 'string') {
            return `Invalid ${key}`;
        }
    }
    if ('timezone' in updateData) {
        const { isValidTimeZone } = await import('@/lib/timezone');
        const value = updateData.timezone as string;
        if (value && !isValidTimeZone(value)) {
            return 'Invalid timezone';
        }
    }
    return null;
}

/**
 * PATCH /api/user/profile
 *
 * Update the current user's profile.
 */
export async function PATCH(request: NextRequest) {
    const authSubject = await getUserFromRequest(request);

    if (!authSubject) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();

        // Only allow updating specific fields
        const allowedFields = [
            'firstName',
            'lastName',
            'phoneNumber',
            'timezone',
            'notificationSettings',
            'storageSettings',
            'transcriptionSettings',
        ];

        const updateData: Record<string, unknown> = {};
        for (const field of allowedFields) {
            if (field in body) {
                updateData[field] = body[field];
            }
        }

        // Validate nested settings shapes so garbage values can't break
        // downstream readers (digest scheduler, retention purge, provider router).
        const settingsError = await validateProfileSettings(updateData);
        if (settingsError) {
            return NextResponse.json({ error: settingsError }, { status: 400 });
        }

        // Update name if firstName or lastName changed
        if (updateData.firstName || updateData.lastName) {
            const user = await findUserByAuthSubject(authSubject);
            if (user) {
                const firstName = (updateData.firstName as string) || user.firstName;
                const lastName = (updateData.lastName as string) || user.lastName;
                updateData.name = `${firstName} ${lastName} `.trim();
            }
        }

        const updatedUser = await updateUser(authSubject, updateData);

        if (!updatedUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating user profile:', error);
        return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }
}

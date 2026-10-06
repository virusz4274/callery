import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { findUserByAuthSubject, getPlanByKey, updateUser, updateUserProfile } from '@/lib/db/users';
import { toUserResponse } from '@/lib/db/converters';
import { getPlanDisplayName } from '@/lib/plans';
import { UpdateProfileBodySchema } from '@/lib/schemas';
import { logger } from '@/lib/logger';


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
                logger.error('Failed to update lastLoginAt:', err)
            );
            // Update local user object for current response correctness
            user.lastLoginAt = now;
        }

        const plan = await getPlanByKey(user.planKey);
        const profile = toUserResponse(user, plan?.name || getPlanDisplayName(user.planKey));

        return NextResponse.json({ profile });
    } catch (error) {
        logger.error('Error fetching user profile:', error);
        return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
    }
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
        const rawBody = await request.json().catch(() => null);
        const parsed = UpdateProfileBodySchema.safeParse(rawBody ?? {});
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }

        const updatedUser = await updateUserProfile(authSubject, parsed.data);

        if (!updatedUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('Error updating user profile:', error);
        return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }
}

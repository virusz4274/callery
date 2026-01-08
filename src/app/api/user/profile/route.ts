import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { findUserByFirebaseUid, updateUser } from '@/lib/db/users';


/**
 * GET /api/user/profile
 * 
 * Get the current user's profile from MongoDB.
 */
export async function GET(request: NextRequest) {
    const firebaseUid = await getUserFromRequest(request);

    if (!firebaseUid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const user = await findUserByFirebaseUid(firebaseUid);

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Convert to response format
        const profile = {
            id: user._id.toString(),
            firebaseUid: user.firebaseUid,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            name: user.name,
            phoneNumber: user.phoneNumber,
            createdAt: user.createdAt.toISOString(),
            role: user.role,
            plan: user.plan,
            timezone: user.timezone,
            notificationSettings: user.notificationSettings,
            storageSettings: user.storageSettings,
            storageUsed: user.storageUsed,
            storageAllocation: user.storageAllocation,
            transcriptionUsed: user.transcriptionUsed,
            transcriptionAllocation: user.transcriptionAllocation,
        };

        return NextResponse.json({ profile });
    } catch (error) {
        console.error('Error fetching user profile:', error);
        return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
    }
}

/**
 * PATCH /api/user/profile
 * 
 * Update the current user's profile.
 */
export async function PATCH(request: NextRequest) {
    const firebaseUid = await getUserFromRequest(request);

    if (!firebaseUid) {
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

        // Update name if firstName or lastName changed
        if (updateData.firstName || updateData.lastName) {
            const user = await findUserByFirebaseUid(firebaseUid);
            if (user) {
                const firstName = (updateData.firstName as string) || user.firstName;
                const lastName = (updateData.lastName as string) || user.lastName;
                updateData.name = `${firstName} ${lastName} `.trim();
            }
        }

        const updatedUser = await updateUser(firebaseUid, updateData);

        if (!updatedUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating user profile:', error);
        return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from 'next/server';
import { ensureUserProfile } from '@/lib/db/users';
import { getFirebaseUidFromSession, getUserFromRequest } from '@/lib/auth-utils';
import { getAdminAuth } from '@/lib/firebase/admin';

/**
 * POST /api/user/ensure-profile
 * 
 * Ensures a user profile exists in MongoDB.
 * Called after successful Firebase authentication.
 */
export async function POST(request: NextRequest) {
    try {
        let firebaseUid = await getUserFromRequest(request);
        if (!firebaseUid) {
            firebaseUid = await getFirebaseUidFromSession();
        }

        if (!firebaseUid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { displayName, firstName, lastName, photoURL } = body as {
            displayName?: string;
            firstName?: string;
            lastName?: string;
            photoURL?: string;
        };

        const auth = getAdminAuth();
        const firebaseUser = await auth.getUser(firebaseUid);
        const email = firebaseUser.email;

        if (!email) {
            return NextResponse.json({ error: 'Authenticated user email is required' }, { status: 400 });
        }

        // Build display name from parts
        let name = displayName || firebaseUser.displayName || '';
        if (firstName || lastName) {
            name = `${firstName || ''} ${lastName || ''} `.trim();
        }
        if (!name) {
            name = email.split('@')[0];
        }

        const { user, wasCreated } = await ensureUserProfile(
            firebaseUid,
            email,
            name,
            photoURL || firebaseUser.photoURL || undefined
        );

        return NextResponse.json({
            success: true,
            wasCreated,
            userId: user._id.toString(),
        });
    } catch (error) {
        console.error('Error ensuring user profile:', error);
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes('New signups are currently disabled')) {
            return NextResponse.json(
                {
                    error: message,
                    details: message,
                },
                { status: 403 }
            );
        }

        return NextResponse.json(
            {
                error: 'Failed to ensure user profile',
                details: message
            },
            { status: 500 }
        );
    }
}

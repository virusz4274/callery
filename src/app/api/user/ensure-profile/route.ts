import { NextRequest, NextResponse } from 'next/server';
import { ensureUserProfile } from '@/lib/db/users';
import { authProvider } from '@/lib/config';
import { getUserFromRequest } from '@/lib/auth-utils';

/**
 * POST /api/user/ensure-profile
 *
 * Ensures a user profile exists in MongoDB.
 * Called after successful authentication. The caller must present a valid
 * session/token whose subject matches the requested authSubject — otherwise
 * anyone could mint profiles for arbitrary subjects.
 */
export async function POST(request: NextRequest) {
    try {
        const verifiedSubject = await getUserFromRequest(request);
        if (!verifiedSubject) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();

        const { authSubject, email, displayName, firstName, lastName, photoURL } = body;

        if (!authSubject || !email) {
            return NextResponse.json(
                { error: 'authSubject and email are required' },
                { status: 400 }
            );
        }

        if (authSubject !== verifiedSubject) {
            return NextResponse.json(
                { error: 'authSubject does not match authenticated user' },
                { status: 403 }
            );
        }

        // Build display name from parts
        let name = displayName;
        if (firstName || lastName) {
            name = `${firstName || ''} ${lastName || ''} `.trim();
        }
        if (!name) {
            name = email.split('@')[0];
        }

        const { user, wasCreated } = await ensureUserProfile(
            authSubject,
            email,
            name,
            photoURL,
            authProvider()
        );

        return NextResponse.json({
            success: true,
            wasCreated,
            userId: user._id.toString(),
        });
    } catch (error) {
        console.error('Error ensuring user profile:', error);
        if (error instanceof Error && error.message === 'New signups are currently disabled.') {
            return NextResponse.json(
                { error: error.message },
                { status: 403 }
            );
        }
        return NextResponse.json(
            { error: 'Failed to ensure user profile' },
            { status: 500 }
        );
    }
}

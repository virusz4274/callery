import { NextRequest, NextResponse } from 'next/server';
import { ensureUserProfile } from '@/lib/db/users';
import { authProvider } from '@/lib/config';

/**
 * POST /api/user/ensure-profile
 * 
 * Ensures a user profile exists in MongoDB.
 * Called after successful Firebase authentication.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const { authSubject, email, displayName, firstName, lastName, photoURL } = body;

        if (!authSubject || !email) {
            return NextResponse.json(
                { error: 'authSubject and email are required' },
                { status: 400 }
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
        return NextResponse.json(
            {
                error: 'Failed to ensure user profile',
                details: error instanceof Error ? error.message : String(error)
            },
            { status: 500 }
        );
    }
}

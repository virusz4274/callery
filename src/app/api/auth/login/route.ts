import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
    try {
        const { idToken } = await request.json();

        if (!idToken) {
            return NextResponse.json({ error: 'ID token required' }, { status: 400 });
        }

        // Verify the ID token and create a session cookie
        const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
        const auth = getAdminAuth();

        // Verify the token to get user details
        const decodedToken = await auth.verifyIdToken(idToken);
        const { uid, email, name, picture } = decodedToken;

        if (!email) {
            console.error('Email is missing in ID token');
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        // Ensure the user exists in MongoDB
        try {
            const { ensureUserProfile } = await import('@/lib/db/users');
            await ensureUserProfile(uid, email, name, picture);
        } catch (dbError) {
            console.error('Failed to ensure user profile:', dbError);
            // We continue even if DB sync fails, but log it. 
            // Ideally we might want to fail the login or handle it gracefully?
            // For now, let's allow login but the user might face issues later (like the upload one).
            // Actually, if we fail here, the client sees an error and retries or shows a message.
            // Given the user's issue ("User not found"), we probably WANT to fail hard or ensure it works.
            // But let's just log for now to avoid blocking login if DB is momentarily down, 
            // though critical features depend on it.
            // On second thought, let's return 500 if we can't create the user, 
            // because the app is broken without a user record.
            return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 });
        }

        // Create the session cookie. This will also verify the ID token.
        const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

        // Set cookie options
        const options = {
            name: 'session',
            value: sessionCookie,
            maxAge: expiresIn,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            sameSite: 'lax' as const,
        };

        // Set the cookie
        (await cookies()).set(options);

        return NextResponse.json({ status: 'success' }, { status: 200 });
    } catch (error: any) {
        console.error('Error creating session:', error);
        // RETURN ACTUAL ERROR FOR DEBUGGING
        return NextResponse.json(
            { error: error.message || 'Internal Server Error', stack: error.stack },
            { status: 500 }
        );
    }
}

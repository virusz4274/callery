import { NextRequest, NextResponse } from 'next/server';
// import { getAdminAuth } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
    try {
        let idToken: unknown;
        try {
            ({ idToken } = await request.json());
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        if (!idToken) {
            return NextResponse.json({ error: 'ID token required' }, { status: 400 });
        }

        if (typeof idToken !== 'string') {
            return NextResponse.json({ error: 'ID token must be a string' }, { status: 400 });
        }

        // Verify the ID token and create a session cookie
        const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
        const maxAgeSeconds = Math.floor(expiresIn / 1000);

        const { getAdminAuth } = await import('@/lib/firebase/admin');
        const auth = getAdminAuth();

        // Verify the token to get user details
        const decodedToken = await auth.verifyIdToken(idToken);
        const { uid, email, name, picture } = decodedToken;

        if (!email) {
            console.error('Email is missing in ID token');
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        // Keep sign-up policy enforcement, but do not hard-fail session sync for transient DB outages.
        let profileEnsureFailed = false;
        try {
            const { ensureUserProfile } = await import('@/lib/db/users');
            await ensureUserProfile(uid, email, name, picture);
        } catch (dbError) {
            const message = dbError instanceof Error ? dbError.message : String(dbError);
            if (message.includes('New signups are currently disabled')) {
                return NextResponse.json({ error: message }, { status: 403 });
            }

            profileEnsureFailed = true;
            console.error('Failed to ensure user profile during login (session will still be created):', dbError);
        }

        // Create the session cookie. This will also verify the ID token.
        const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

        // Set cookie options
        const options = {
            name: 'session',
            value: sessionCookie,
            maxAge: maxAgeSeconds,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            sameSite: 'lax' as const,
        };

        // Set the cookie
        (await cookies()).set(options);

        return NextResponse.json(
            {
                status: 'success',
                profileEnsureFailed,
            },
            { status: 200 }
        );
    } catch (error: unknown) {
        console.error('Error creating session:', error);
        if (typeof error === 'object' && error !== null && 'code' in error) {
            const code = (error as { code?: unknown }).code;
            if (typeof code === 'string' && code.startsWith('auth/')) {
                return NextResponse.json({ error: 'Invalid or expired authentication token' }, { status: 401 });
            }
        }

        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

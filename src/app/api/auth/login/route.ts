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
    } catch (error) {
        console.error('Error creating session:', error);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
}

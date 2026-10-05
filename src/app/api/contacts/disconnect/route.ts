import { NextResponse } from 'next/server';
import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { disconnectGoogleContacts } from '@/services/google/start-contacts-sync';

export async function POST() {
    const authSubject = await getAuthSubjectFromSession();
    if (!authSubject) {
        return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    try {
        await disconnectGoogleContacts(authSubject);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to disconnect Google Contacts.',
            },
            { status: 500 }
        );
    }
}

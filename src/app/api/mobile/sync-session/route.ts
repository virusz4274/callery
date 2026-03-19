import { NextResponse } from 'next/server';

import { getFirebaseUidFromSession } from '@/lib/auth-utils';
import { createMobileSyncSessionToken } from '@/lib/mobile-sync-session-token';

export async function POST() {
    const firebaseUid = await getFirebaseUidFromSession();
    if (!firebaseUid) {
        return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const syncToken = await createMobileSyncSessionToken(firebaseUid);
        return NextResponse.json({ success: true, syncToken });
    } catch (error) {
        console.error('[mobileSyncSession] Failed to create token:', error);
        return NextResponse.json({ success: false, error: 'Failed to create sync session' }, { status: 500 });
    }
}

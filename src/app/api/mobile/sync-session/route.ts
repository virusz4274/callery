import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

import { getUserFromRequest } from '@/lib/auth-utils';
import { createMobileSyncSessionToken } from '@/lib/mobile-sync-session-token';

export async function POST(request: NextRequest) {
    const authSubject = await getUserFromRequest(request);
    if (!authSubject) {
        return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const syncToken = await createMobileSyncSessionToken(authSubject);
        return NextResponse.json({ success: true, syncToken });
    } catch (error) {
        logger.error('[mobileSyncSession] Failed to create token:', error);
        return NextResponse.json({ success: false, error: 'Failed to create sync session' }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from 'next/server';

import { getMobileSyncUserFromRequest } from '@/lib/auth-utils';
import {
    initializeDirectUploadForUser,
    type InitDirectUploadInput,
} from '@/lib/direct-upload-service';

export async function POST(request: NextRequest) {
    const firebaseUid = await getMobileSyncUserFromRequest(request);
    if (!firebaseUid) {
        return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    let body: InitDirectUploadInput;
    try {
        body = (await request.json()) as InitDirectUploadInput;
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const result = await initializeDirectUploadForUser(firebaseUid, body);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

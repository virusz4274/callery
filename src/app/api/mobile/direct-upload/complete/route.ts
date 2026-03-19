import { NextRequest, NextResponse } from 'next/server';

import { getMobileSyncUserFromRequest } from '@/lib/auth-utils';
import {
    completeDirectUploadForUser,
    type CompleteDirectUploadInput,
} from '@/lib/direct-upload-service';

export async function POST(request: NextRequest) {
    const firebaseUid = await getMobileSyncUserFromRequest(request);
    if (!firebaseUid) {
        return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    let body: CompleteDirectUploadInput;
    try {
        body = (await request.json()) as CompleteDirectUploadInput;
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const result = await completeDirectUploadForUser(firebaseUid, body);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

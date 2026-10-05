import { NextRequest, NextResponse } from 'next/server';

import { getMobileSyncUserFromRequest } from '@/lib/auth-utils';
import { initializeDirectUploadForUser } from '@/lib/direct-upload-service';
import { InitDirectUploadBodySchema } from '@/lib/schemas';

export async function POST(request: NextRequest) {
    const authSubject = await getMobileSyncUserFromRequest(request);
    if (!authSubject) {
        return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = InitDirectUploadBodySchema.safeParse(rawBody);
    if (!parsed.success) {
        return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const result = await initializeDirectUploadForUser(authSubject, parsed.data);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

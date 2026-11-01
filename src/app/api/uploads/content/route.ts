import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { getAuthSubjectFromSession, getUserFromRequest } from '@/lib/auth-utils';
import { isOriginAllowed, consumeRateLimit } from '@/lib/rate-limit';
import { verifyUploadSessionToken } from '@/lib/upload-session-token';
import { IntegrationCollections, integrationDb } from '@/lib/integrations/database';
import type { UploadSession } from '@/lib/integrations/uploads';
import { streamBoundedUpload } from '@/lib/integrations/bounded-upload';
import { ApiError } from '@/lib/integrations/contracts';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function PUT(request: NextRequest) {
    if (!request.headers.get('origin') || !isOriginAllowed(request.headers.get('origin'), new URL(env.NEXT_PUBLIC_APP_URL).origin)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
    const subject = await getAuthSubjectFromSession() || await getUserFromRequest(request);
    const token = await verifyUploadSessionToken(request.headers.get('x-upload-token') || '');
    if (!subject || !token?.uploadId || token.authSubject !== subject) return NextResponse.json({ error: 'Invalid upload authorization.' }, { status: 401 });
    try {
        const db = await integrationDb();
        if (!(await consumeRateLimit({ key: `upload-stream:${subject}`, limit: 120, windowMs: 60 * 60_000 }, db)).allowed) throw new ApiError(429, 'rate_limited', 'Upload request limit reached.');
        const session = await db.collection<UploadSession>(IntegrationCollections.uploads).findOne({ _id: token.uploadId, owner: subject, integrationId: 'legacy', stagingKey: token.r2Key });
        if (!session || session.input.fileSize !== token.fileSize) throw new ApiError(404, 'not_found', 'Upload reservation unavailable.');
        await streamBoundedUpload(request, session, db);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error instanceof ApiError ? error.message : 'Upload interrupted. Retry this upload.' }, { status: error instanceof ApiError ? error.status : 503 });
    }
}

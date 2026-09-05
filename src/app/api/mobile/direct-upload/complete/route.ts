import { NextRequest, NextResponse, after } from 'next/server';

import { getMobileSyncUserFromRequest } from '@/lib/auth-utils';
import { completeDirectUploadForUser } from '@/lib/direct-upload-service';
import { logger } from '@/lib/logger';
import { startAutoTranscriptionForRecording } from '@/app/actions/upload/transcription';
import { CompleteDirectUploadBodySchema } from '@/lib/schemas';

export async function POST(request: NextRequest) {
    const firebaseUid = await getMobileSyncUserFromRequest(request);
    if (!firebaseUid) {
        return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = CompleteDirectUploadBodySchema.safeParse(rawBody);
    if (!parsed.success) {
        return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const { shouldStartAutoTranscription, ...result } = await completeDirectUploadForUser(firebaseUid, parsed.data);

    if (result.success && result.recordingId && shouldStartAutoTranscription) {
        after(async () => {
            try {
                await startAutoTranscriptionForRecording(firebaseUid, result.recordingId!);
            } catch (error) {
                logger.error('[mobileDirectUpload] after() auto-transcription failed:', error);
            }
        });
    }

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

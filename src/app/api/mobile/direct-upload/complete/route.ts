import { NextRequest, NextResponse, after } from 'next/server';

import { getMobileSyncUserFromRequest } from '@/lib/auth-utils';
import {
    completeDirectUploadForUser,
    type CompleteDirectUploadInput,
} from '@/lib/direct-upload-service';
import { logger } from '@/lib/logger';
import { startAutoTranscriptionForRecording } from '@/app/actions/upload/transcription';

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

    const { shouldStartAutoTranscription, ...result } = await completeDirectUploadForUser(firebaseUid, body);

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

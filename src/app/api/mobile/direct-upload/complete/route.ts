import { NextRequest, NextResponse, after } from 'next/server';

import { getMobileSyncUserFromRequest } from '@/lib/auth-utils';
import { completeDirectUploadForUser } from '@/lib/direct-upload-service';
import { logger } from '@/lib/logger';
import { startAutoTranscriptionForRecording } from '@/app/actions/upload/transcription';
import { CompleteDirectUploadBodySchema } from '@/lib/schemas';
import { processTranscriptionJobs } from '@/lib/integrations/jobs';

export async function POST(request: NextRequest) {
    const authSubject = await getMobileSyncUserFromRequest(request);
    if (!authSubject) {
        return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = CompleteDirectUploadBodySchema.safeParse(rawBody);
    if (!parsed.success) {
        return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const { shouldStartAutoTranscription, ...result } = await completeDirectUploadForUser(authSubject, parsed.data);
    if (result.success) after(async () => { await processTranscriptionJobs(); });

    if (result.success && result.recordingId && shouldStartAutoTranscription) {
        after(async () => {
            try {
                await startAutoTranscriptionForRecording(authSubject, result.recordingId!);
            } catch (error) {
                logger.error('[mobileDirectUpload] after() auto-transcription failed:', error);
            }
        });
    }

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

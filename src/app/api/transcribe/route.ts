import { NextRequest, NextResponse, after } from 'next/server';
import { getRecordingById, updateRecording } from '@/lib/db/recordings';
import { getSignedR2Url } from '@/lib/r2';
import { GeminiService } from '@/services/ai/gemini-service';
import { SonioxService } from '@/services/transcription/soniox-service';
import { checkUserAccess, checkTranscriptionAccess } from '@/lib/access-control';
import { getUserFromRequest } from '@/lib/auth-utils';
import { calculateBilledDuration } from '@/lib/utils/billing';
import { incrementTranscriptionUsed, findUserByFirebaseUid, checkAndResetUsageCycle } from '@/lib/db/users';
import { logger } from '@/lib/logger';

// export const maxDuration = parseInt(process.env.TRANSCRIPTION_MAX_DURATION_SECONDS || '300'); // 5 minutes timeout for Vercel/Next.js functions
export const maxDuration = 300; // 5 minutes

const aiService = new GeminiService();
const transcriptionService = new SonioxService();

export async function POST(req: NextRequest) {
    try {
        // 1. Authenticate
        const uid = await getUserFromRequest(req);
        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await findUserByFirebaseUid(uid);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const access = checkUserAccess(user);
        if (!access.allowed) {
            return NextResponse.json({ error: access.reason }, { status: 403 });
        }

        // 2a. Check Usage Cycle
        const currentUser = await checkAndResetUsageCycle(user);

        const body = await req.json();
        const { recordingId } = body;

        if (!recordingId) {
            return NextResponse.json({ error: 'Missing recordingId' }, { status: 400 });
        }

        // 2. Get Recording
        const recording = await getRecordingById(recordingId, uid);
        if (!recording) {
            return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
        }

        // Set status to processing immediately for UI feedback
        await updateRecording(recordingId, uid, { transcriptionStatus: 'processing' });
        logger.info(`[API/Transcribe] Starting background job for ${recordingId}`);

        // 3. Check Transcription Access
        const transcriptionAccess = checkTranscriptionAccess(currentUser, recording.duration);
        if (!transcriptionAccess.allowed) {
            return NextResponse.json({ error: transcriptionAccess.reason || 'Transcription limit exceeded' }, { status: 403 });
        }

        // 5. Trigger Background Transcription
        after(async () => {
            try {
                const fileUrl = await getSignedR2Url(recording.r2Key, 1800);
                logger.info(`[API/Transcribe] Processing ${recordingId}...`);
                const result = await transcriptionService.transcribe(fileUrl, recording.duration);
                logger.info(`[API/Transcribe] Transcription received for ${recordingId}`);

                // Parallelize LLM operations ONLY if text exists
                let summary = '';
                let transliteratedSegments = result.segments;
                let summaryEmbedding: number[] = [];

                if (result.text && result.text.trim()) {
                    logger.info(`[API/Transcribe] Running AI summary and transliteration for ${recordingId}`);
                    [summary, transliteratedSegments] = await Promise.all([
                        aiService.generateSummary(result.text, result.languageCode),
                        aiService.generateTransliteration(result.segments, result.languageCode)
                    ]);

                    // Generate embedding from summary
                    summaryEmbedding = summary ? await aiService.generateEmbedding(summary) : [];
                }

                // Save Result
                logger.info(`[API/Transcribe] Saving results for ${recordingId}`);
                await updateRecording(recordingId, uid, {
                    transcriptionStatus: 'completed',
                    fullTranscript: transliteratedSegments, // This now includes transliteratedText
                    languageCode: result.languageCode,
                    summary,
                    summaryEmbedding,
                });

                // Calculate and record billed usage
                const billedDuration = calculateBilledDuration(recording.duration);
                await incrementTranscriptionUsed(uid, billedDuration);
                logger.info(`[API/Transcribe] Job completed for ${recordingId}`);

                // Delete from Soniox
                try {
                    await transcriptionService.deleteTranscript(result.transcriptionId);
                } catch (deleteError) {
                    logger.error('Failed to delete transcript from Soniox:', deleteError);
                }
            } catch (error) {
                logger.error('[API/Transcribe] Background job failed:', error);
                await updateRecording(recordingId, uid, {
                    transcriptionStatus: 'failed',
                });
            }
        });

        // Return "Processing" status immediately
        return NextResponse.json({
            success: true,
        });

    } catch (error) {
        logger.error('Transcription start error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}

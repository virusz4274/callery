import { NextRequest, NextResponse, after } from 'next/server';
import { getRecordingById, updateRecording } from '@/lib/db/recordings';
import { getSignedR2Url } from '@/lib/r2';
import { getAiService } from '@/services/ai';
import { getTranscriptionService, transcriptionMultiplier } from '@/services/transcription';
import { toBlockedDetails, toFailureDetails } from '@/services/transcription/failure-events';
import { logSystemEvent } from '@/lib/db/system-log';
import { checkUserAccess, checkTranscriptionAccess } from '@/lib/access-control';
import { getUserFromRequest } from '@/lib/auth-utils';
import { calculateBilledDuration } from '@/lib/utils/billing';
import { recordTranscriptionUsage, findUserByAuthSubject, checkAndResetUsageCycle } from '@/lib/db/users';
import { logger } from '@/lib/logger';

// export const maxDuration = parseInt(process.env.TRANSCRIPTION_MAX_DURATION_SECONDS || '300'); // 5 minutes timeout for Vercel/Next.js functions
export const maxDuration = 300; // 5 minutes

const aiService = getAiService();

export async function POST(req: NextRequest) {
    try {
        // 1. Authenticate
        const uid = await getUserFromRequest(req);
        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await findUserByAuthSubject(uid);
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

        // 3. Resolve provider (user override aware) and check access in billed units.
        const { service: transcriptionService, provider } = getTranscriptionService(currentUser);
        const previewUnits = calculateBilledDuration(recording.duration) * transcriptionMultiplier(provider);
        const transcriptionAccess = checkTranscriptionAccess(currentUser, previewUnits);
        if (!transcriptionAccess.allowed) {
            const reason = transcriptionAccess.reason || 'Transcription limit exceeded';
            // Don't leave the recording stuck in 'processing'; the user just
            // sees 'failed' while the reason goes to the admin audit log.
            await updateRecording(recordingId, uid, { transcriptionStatus: 'failed' });
            await logSystemEvent(
                'TRANSCRIPTION_BLOCKED',
                toBlockedDetails(reason, {
                    provider,
                    recordingId,
                    authSubject: uid,
                    durationSeconds: recording.duration,
                }),
                recordingId,
            );
            return NextResponse.json({ error: reason }, { status: 403 });
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
                    const aiContext = { recordingId, authSubject: uid };
                    [summary, transliteratedSegments] = await Promise.all([
                        aiService.generateSummary(result.text, result.languageCode, aiContext),
                        aiService.generateTransliteration(result.segments, result.languageCode, aiContext)
                    ]);

                    // Generate embedding from summary
                    summaryEmbedding = summary ? await aiService.generateEmbedding(summary, aiContext) : [];
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
                const { billedUnits } = await recordTranscriptionUsage(uid, {
                    provider,
                    rawSeconds: recording.duration,
                    recordingId,
                });
                logger.info(`[API/Transcribe] Job completed for ${recordingId} (${billedUnits} units via ${provider})`);

                // Delete from provider
                try {
                    await transcriptionService.deleteTranscript(result.transcriptionId);
                } catch (deleteError) {
                    logger.error(`Failed to delete transcript from ${provider}:`, deleteError);
                }
            } catch (error) {
                logger.error('[API/Transcribe] Background job failed:', error);
                await updateRecording(recordingId, uid, {
                    transcriptionStatus: 'failed',
                });
                await logSystemEvent(
                    'TRANSCRIPTION_FAILED',
                    toFailureDetails(error, {
                        provider,
                        recordingId,
                        authSubject: uid,
                        durationSeconds: recording.duration,
                    }),
                    recordingId,
                );
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

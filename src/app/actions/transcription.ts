'use server';

import { after } from 'next/server';
import { getRecordingById, updateRecording } from '@/lib/db/recordings';
import { getSignedR2Url } from '@/lib/r2';
import { GeminiService } from '@/services/ai/gemini-service';
import { SonioxService } from '@/services/transcription/soniox-service';
import { checkUserAccess, checkTranscriptionAccess } from '@/lib/access-control';
import { getFirebaseUidFromSession } from '@/lib/auth-utils';
import { calculateBilledDuration } from '@/lib/utils/billing';
import { incrementTranscriptionUsed, findUserByFirebaseUid, checkAndResetUsageCycle } from '@/lib/db/users';
import { logger } from '@/lib/logger';
import { reportUsage } from '@/lib/stripe/usage';
import { createNotification } from '@/lib/notifications';

const aiService = new GeminiService();
const transcriptionService = new SonioxService();

import { RecordingIdSchema } from '@/lib/schemas';

// ... imports

export async function transcribeRecordingAction(recordingId: string) {
    try {
        const parseResult = RecordingIdSchema.safeParse(recordingId);
        if (!parseResult.success) {
            return { error: 'Invalid recording ID' };
        }
        const validatedRecordingId = parseResult.data;

        // 1. Authenticate
        const uid = await getFirebaseUidFromSession();
        if (!uid) {
            return { error: 'Unauthorized' };
        }

        const user = await findUserByFirebaseUid(uid);
        if (!user) {
            return { error: 'User not found' };
        }

        const access = checkUserAccess(user);
        if (!access.allowed) {
            return { error: access.reason };
        }

        // 2a. Check Usage Cycle
        const currentUser = await checkAndResetUsageCycle(user);

        // validated via schema
        // if (!recordingId) { ... }

        // 2. Get Recording
        const recording = await getRecordingById(validatedRecordingId, uid);
        if (!recording) {
            return { error: 'Recording not found' };
        }

        // 3. Check Transcription Access
        const transcriptionAccess = checkTranscriptionAccess(currentUser, recording.duration);
        if (!transcriptionAccess.allowed) {
            return { error: transcriptionAccess.reason || 'Transcription limit exceeded' };
        }

        // Set status to processing immediately for UI feedback
        await updateRecording(validatedRecordingId, uid, { transcriptionStatus: 'processing' });
        logger.info(`[Action/Transcribe] Starting background job for ${validatedRecordingId}`);

        // 5. Trigger Background Transcription
        after(async () => {
            try {
                const fileUrl = await getSignedR2Url(recording.r2Key, 1800);
                logger.info(`[Action/Transcribe] Processing ${validatedRecordingId}...`);
                const result = await transcriptionService.transcribe(fileUrl, { durationSeconds: recording.duration });
                logger.info(`[Action/Transcribe] Transcription received for ${validatedRecordingId}`);

                // Parallelize LLM operations ONLY if text exists
                let summary = '';
                let transliteratedSegments = result.segments;
                let summaryEmbedding: number[] = [];

                if (result.text && result.text.trim()) {
                    logger.info(`[Action/Transcribe] Running AI summary and transliteration for ${validatedRecordingId}`);
                    [summary, transliteratedSegments] = await Promise.all([
                        aiService.generateSummary(result.text, result.languageCode),
                        aiService.generateTransliteration(result.segments, result.languageCode)
                    ]);

                    // Generate embedding from summary
                    summaryEmbedding = summary ? await aiService.generateEmbedding(summary) : [];
                }

                // Save Result
                logger.info(`[Action/Transcribe] Saving results for ${validatedRecordingId}`);
                await updateRecording(validatedRecordingId, uid, {
                    transcriptionStatus: 'completed',
                    fullTranscript: transliteratedSegments, // This now includes transliteratedText
                    languageCode: result.languageCode,
                    summary,
                    summaryEmbedding,
                });

                // Calculate and record billed usage
                const billedDuration = calculateBilledDuration(recording.duration);
                await incrementTranscriptionUsed(uid, billedDuration);
                await reportUsage(uid, 'transcription', billedDuration);
                logger.info(`[Action/Transcribe] Job completed for ${validatedRecordingId}`);

                // Delete from Soniox
                try {
                    await transcriptionService.deleteTranscript(result.transcriptionId);
                } catch (deleteError) {
                    logger.error('Failed to delete transcript from Soniox:', deleteError);
                }

                await createNotification(
                    user._id,
                    'success',
                    'Transcription Ready',
                    `Your recording "${recording.standardizedDisplayName || recording.fileName}" is ready.`,
                    `/?id=${validatedRecordingId}`
                );

            } catch (error) {
                logger.error('[Action/Transcribe] Background job failed:', error);
                await updateRecording(validatedRecordingId, uid, {
                    transcriptionStatus: 'failed',
                });

                await createNotification(
                    user._id,
                    'error',
                    'Transcription Failed',
                    `Processing failed for "${recording.fileName}".`,
                );
            }
        });

        // Return success immediately
        return { success: true };

    } catch (error) {
        logger.error('Transcription start error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
        return { error: errorMessage };
    }
}

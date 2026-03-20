'use server';

import { z } from 'zod';
import { after } from 'next/server';
import { getRecordingById, markTranscriptionUsageReported, updateRecording } from '@/lib/db/recordings';
import { getSignedR2Url } from '@/lib/r2';
import { GeminiService } from '@/services/ai/gemini-service';
import { SonioxService } from '@/services/transcription/soniox-service';
import { ElevenLabsService } from '@/services/transcription/elevenlabs-service';
import { TranscriptionFactory, type TranscriptionProviderId } from '@/services/transcription/factory';
import { checkUserAccess, checkTranscriptionAccess } from '@/lib/access-control';
import { getFirebaseUidFromSession } from '@/lib/auth-utils';
import { calculateBilledDuration } from '@/lib/utils/billing';
import { incrementTranscriptionUsed, findUserByFirebaseUid, checkAndResetUsageCycle } from '@/lib/db/users';
import { logger } from '@/lib/logger';
import { reportUsage } from '@/lib/stripe/usage';
import { createNotification } from '@/lib/notifications';
import { buildTranscriptionFileSizeError, isTranscriptionFileSizeAllowed } from '@/lib/transcription-limits';
import { RecordingIdSchema } from '@/lib/schemas';
import { getProviderMultiplier } from '@/app/actions/transcription-providers';

const aiService = new GeminiService();

const ManualTranscriptionOptionsSchema = z.object({
    provider: z.enum(['soniox', 'elevenlabs']).optional(),
    model: z.string().trim().min(1).max(120).optional(),
});

type ManualTranscriptionOptions = z.infer<typeof ManualTranscriptionOptionsSchema>;

async function runManualTranscriptionJob({
    recordingId,
    firebaseUid,
    userId,
    fileName,
    displayName,
    r2Key,
    duration,
    providerId,
    model,
    multiplier,
}: {
    recordingId: string;
    firebaseUid: string;
    userId: Parameters<typeof createNotification>[0];
    fileName: string;
    displayName: string;
    r2Key: string;
    duration: number;
    providerId: TranscriptionProviderId;
    model?: string;
    multiplier: number;
}) {
    const fileUrl = await getSignedR2Url(r2Key, 1800);
    const transcriptionService = TranscriptionFactory.getService(providerId);

    if (providerId === 'elevenlabs' && duration > 300 && transcriptionService instanceof ElevenLabsService) {
        const asyncResult = await transcriptionService.transcribeAsync(fileUrl, {
            durationSeconds: duration,
            model,
            webhookMetadata: { recordingId, firebaseUid },
        });

        await updateRecording(recordingId, firebaseUid, {
            externalTranscriptionId: asyncResult.transcriptionId || asyncResult.requestId,
            transcriptionProvider: providerId,
            transcriptionModel: model,
            transcriptionCostMultiplier: multiplier,
        });
        return;
    }

    if (providerId === 'soniox' && duration > 300 && transcriptionService instanceof SonioxService) {
        const asyncResult = await transcriptionService.transcribeAsync(fileUrl, {
            durationSeconds: duration,
            model,
            webhookMetadata: { recordingId, firebaseUid },
        });

        await updateRecording(recordingId, firebaseUid, {
            externalTranscriptionId: asyncResult.transcriptionId || asyncResult.requestId,
            transcriptionProvider: providerId,
            transcriptionModel: model,
            transcriptionCostMultiplier: multiplier,
        });
        return;
    }

    const result = await transcriptionService.transcribe(fileUrl, {
        durationSeconds: duration,
        model,
    });

    let summary = '';
    let transliteratedSegments = result.segments;
    let summaryEmbedding: number[] = [];

    if (result.text && result.text.trim()) {
        [summary, transliteratedSegments] = await Promise.all([
            aiService.generateSummary(result.text, result.languageCode),
            aiService.generateTransliteration(result.segments, result.languageCode),
        ]);

        summaryEmbedding = summary ? await aiService.generateEmbedding(summary) : [];
    }

    await updateRecording(recordingId, firebaseUid, {
        transcriptionStatus: 'completed',
        fullTranscript: transliteratedSegments,
        languageCode: result.languageCode,
        summary,
        summaryEmbedding,
        transcriptionProvider: providerId,
        transcriptionModel: result.model,
        transcriptionCostMultiplier: multiplier,
    });

    const usageReportId = `${providerId}:${result.transcriptionId}`;
    const shouldReportUsage = await markTranscriptionUsageReported(recordingId, firebaseUid, usageReportId);
    if (shouldReportUsage) {
        const billedDuration = calculateBilledDuration(duration);
        const billedCostDuration = billedDuration * multiplier;
        await incrementTranscriptionUsed(firebaseUid, billedCostDuration);
        await reportUsage(firebaseUid, 'transcription', billedDuration, {
            multiplier,
            identifier: `transcription:${firebaseUid}:recording:${recordingId}:manual:${providerId}:${result.transcriptionId}`,
        });
    }

    try {
        await transcriptionService.deleteTranscript(result.transcriptionId);
    } catch (deleteError) {
        logger.error('Failed to delete transcript from provider:', deleteError);
    }

    await createNotification(
        userId,
        'success',
        'Transcription Ready',
        `Your recording "${displayName}" is ready.`,
        `/?id=${recordingId}`
    );
}

export async function transcribeRecordingAction(recordingId: string, options?: ManualTranscriptionOptions) {
    try {
        const parseResult = RecordingIdSchema.safeParse(recordingId);
        if (!parseResult.success) {
            return { error: 'Invalid recording ID' };
        }
        const validatedRecordingId = parseResult.data;

        const optionsResult = ManualTranscriptionOptionsSchema.safeParse(options || {});
        if (!optionsResult.success) {
            return { error: 'Invalid transcription options' };
        }

        const providerId = optionsResult.data.provider || 'soniox';
        const model = optionsResult.data.model;

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

        if (!TranscriptionFactory.isProviderAvailable(providerId)) {
            return { error: 'Selected transcription provider is not configured' };
        }

        const currentUser = await checkAndResetUsageCycle(user);
        const recording = await getRecordingById(validatedRecordingId, uid);
        if (!recording) {
            return { error: 'Recording not found' };
        }

        if (recording.transcriptionStatus === 'processing') {
            return { error: 'This recording is already being transcribed' };
        }

        if (!isTranscriptionFileSizeAllowed(recording.fileSize)) {
            return { error: buildTranscriptionFileSizeError(recording.fileSize) };
        }

        const multiplier = await getProviderMultiplier(providerId);
        const costDuration = recording.duration * multiplier;
        const transcriptionAccess = checkTranscriptionAccess(currentUser, costDuration);
        if (!transcriptionAccess.allowed) {
            return { error: transcriptionAccess.reason || 'Transcription limit exceeded' };
        }

        await updateRecording(validatedRecordingId, uid, {
            transcriptionStatus: 'processing',
            transcriptionProvider: providerId,
            transcriptionModel: model,
            transcriptionCostMultiplier: multiplier,
        });
        logger.info(`[Action/Transcribe] Starting ${providerId} background job for ${validatedRecordingId}`);

        after(async () => {
            try {
                await runManualTranscriptionJob({
                    recordingId: validatedRecordingId,
                    firebaseUid: uid,
                    userId: user._id,
                    fileName: recording.fileName,
                    displayName: recording.standardizedDisplayName,
                    r2Key: recording.r2Key,
                    duration: recording.duration,
                    providerId,
                    model,
                    multiplier,
                });
                logger.info(`[Action/Transcribe] Job completed for ${validatedRecordingId}`);
            } catch (error) {
                logger.error('[Action/Transcribe] Background job failed:', error);
                await updateRecording(validatedRecordingId, uid, {
                    transcriptionStatus: 'failed',
                });

                await createNotification(
                    user._id,
                    'error',
                    'Transcription Failed',
                    `Processing failed for "${recording.standardizedDisplayName}".`,
                );
            }
        });

        return { success: true };
    } catch (error) {
        logger.error('Transcription start error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
        return { error: errorMessage };
    }
}

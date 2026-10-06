
import { z } from 'zod';
import { after } from 'next/server';
import { claimRecordingForTranscription, getRecordingById, markTranscriptionUsageReported, updateRecording } from '@/lib/db/recordings';
import { getTranscriptionAudioUrl } from '@/services/transcription/audio-url';
import { getAiService } from '@/services/ai';
import { SonioxService } from '@/services/transcription/soniox-service';
import { ElevenLabsService } from '@/services/transcription/elevenlabs-service';
import { TranscriptionFactory, type TranscriptionProviderId } from '@/services/transcription/factory';
import { checkUserAccess, checkTranscriptionAccess } from '@/lib/access-control';
import { resolveTranscriptionProvider } from '@/services/transcription';
import { calculateBilledDuration } from '@/lib/utils/billing';
import { incrementTranscriptionUsed, findUserByAuthSubject } from '@/lib/db/users';
import { logger } from '@/lib/logger';
import { reportUsage } from '@/lib/stripe/usage';
import { createNotification } from '@/lib/notifications';
import { buildRecordingNotificationLink } from '@/lib/notification-links';
import { buildTranscriptionFileSizeError, isTranscriptionFileSizeAllowed } from '@/lib/transcription-limits';
import { RecordingIdSchema } from '@/lib/schemas';
import { getProviderMultiplier } from '@/app/actions/transcription-providers';
import { logSystemEvent } from '@/lib/db/system-log';
import { toBlockedDetails, toFailureDetails } from '@/services/transcription/failure-events';



const ManualTranscriptionOptionsSchema = z.object({
    provider: z.enum(['soniox', 'elevenlabs', 'gemini', 'openai_compat']).optional(),
    model: z.string().trim().min(1).max(120).optional(),
});

export type ManualTranscriptionOptions = z.infer<typeof ManualTranscriptionOptionsSchema>;

async function runManualTranscriptionJob({
    recordingId,
    authSubject,
    userId,
    displayName,
    r2Key,
    duration,
    providerId,
    model,
    multiplier,
}: {
    recordingId: string;
    authSubject: string;
    userId: Parameters<typeof createNotification>[0];
    displayName: string;
    r2Key: string;
    duration: number;
    providerId: TranscriptionProviderId;
    model?: string;
    multiplier: number;
}) {
    const fileUrl = await getTranscriptionAudioUrl(providerId, r2Key);
    const transcriptionService = TranscriptionFactory.getService(providerId);

    if (providerId === 'elevenlabs' && duration > 300 && transcriptionService instanceof ElevenLabsService) {
        const asyncResult = await transcriptionService.transcribeAsync(fileUrl, {
            durationSeconds: duration,
            model,
            webhookMetadata: { recordingId, authSubject },
        });

        await updateRecording(recordingId, authSubject, {
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
            webhookMetadata: { recordingId, authSubject },
        });

        await updateRecording(recordingId, authSubject, {
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
            getAiService().generateSummary(result.text, result.languageCode),
            getAiService().generateTransliteration(result.segments, result.languageCode),
        ]);

        summaryEmbedding = summary ? await getAiService().generateEmbedding(summary) : [];
    }

    await updateRecording(recordingId, authSubject, {
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
    const shouldReportUsage = await markTranscriptionUsageReported(recordingId, authSubject, usageReportId);
    if (shouldReportUsage) {
        const billedDuration = calculateBilledDuration(duration);
        const billedCostDuration = Math.ceil(billedDuration * multiplier);
        await incrementTranscriptionUsed(authSubject, billedCostDuration);
        await reportUsage(authSubject, 'transcription', billedDuration, {
            multiplier,
            identifier: `transcription:${authSubject}:recording:${recordingId}:manual:${providerId}:${result.transcriptionId}`,
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
        buildRecordingNotificationLink(recordingId)
    );
}

export async function startManualTranscription(uid: string, recordingId: string, options?: ManualTranscriptionOptions) {
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

        const model = optionsResult.data.model;

        if (!uid) {
            return { error: 'Unauthorized' };
        }

        const user = await findUserByAuthSubject(uid);
        if (!user) {
            return { error: 'User not found' };
        }

        const providerId = optionsResult.data.provider || resolveTranscriptionProvider(user);

        const access = checkUserAccess(user);
        if (!access.allowed) {
            return { error: access.reason };
        }

        if (!TranscriptionFactory.isProviderAvailable(providerId)) {
            return { error: 'Selected transcription provider is not configured' };
        }

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
        const costDuration = Math.ceil(calculateBilledDuration(recording.duration) * multiplier);
        const transcriptionAccess = checkTranscriptionAccess(user, costDuration);
        if (!transcriptionAccess.allowed) {
            await logSystemEvent('TRANSCRIPTION_BLOCKED', toBlockedDetails(transcriptionAccess.reason || 'Quota exceeded', {
                provider: providerId, recordingId: validatedRecordingId, authSubject: uid, durationSeconds: recording.duration,
            }), validatedRecordingId);
            return { error: transcriptionAccess.reason || 'Transcription limit exceeded' };
        }

        const claimed = await claimRecordingForTranscription(validatedRecordingId, uid, {
            transcriptionProvider: providerId,
            transcriptionModel: model,
            transcriptionCostMultiplier: multiplier,
        });
        if (!claimed) return { error: 'This recording is already being transcribed' };
        logger.info(`[Action/Transcribe] Starting ${providerId} background job for ${validatedRecordingId}`);

        after(async () => {
            try {
                await runManualTranscriptionJob({
                    recordingId: validatedRecordingId,
                    authSubject: uid,
                    userId: user._id,
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
                await logSystemEvent('TRANSCRIPTION_FAILED', toFailureDetails(error, {
                    provider: providerId, recordingId: validatedRecordingId, authSubject: uid, durationSeconds: recording.duration,
                }), validatedRecordingId);
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

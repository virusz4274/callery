import { resolveTranscriptionProvider } from '@/services/transcription';
import { findUserByAuthSubject } from '@/lib/db/users';
import { claimRecordingForTranscription, getRecordingById, markTranscriptionUsageReported, updateRecording } from '@/lib/db/recordings';
import { logger } from '@/lib/logger';
import { checkTranscriptionAccess } from '@/lib/access-control';
import { getProviderMultiplier } from '@/app/actions/transcription-providers';
import type { Recording, User } from '@/lib/db/types';
import { TranscriptionFactory, TranscriptionProviderId } from '@/services/transcription/factory';
import { getTranscriptionAudioUrl } from '@/services/transcription/audio-url';
import { ElevenLabsService } from '@/services/transcription/elevenlabs-service';
import { SonioxService } from '@/services/transcription/soniox-service';
import { getAiService } from '@/services/ai';
import { createNotification } from '@/lib/notifications';
import { buildRecordingNotificationLink } from '@/lib/notification-links';
import { calculateBilledDuration } from '@/lib/utils/billing';
import { reportUsage } from '@/lib/stripe/usage';
import { incrementTranscriptionUsed } from '@/lib/db/users';
import {
    buildTranscriptionFileSizeError,
    isTranscriptionFileSizeAllowed,
    MAX_TRANSCRIPTION_FILE_SIZE_LABEL,
} from '@/lib/transcription-limits';



export type AutoTranscriptionResult = {
    outcome: 'skipped' | 'started_async' | 'completed';
};

export async function markAutoTranscriptionFailed(
    authSubject: string,
    recordingId: string,
    standardizedDisplayName: string,
    errorMessage?: string
) {
    await updateRecording(recordingId, authSubject, { transcriptionStatus: 'failed' });

    const user = await findUserByAuthSubject(authSubject);
    if (user) {
        const suffix = errorMessage ? ` ${errorMessage}` : '';
        await createNotification(
            user._id,
            'error',
            'Transcription Failed',
            `Processing failed for "${standardizedDisplayName}".${suffix}`,
        );
    }
}

async function runAutoTranscription(
    authSubject: string,
    recording: Recording,
    user: User
): Promise<AutoTranscriptionResult> {
    if (!user?.transcriptionSettings?.autoTranscribe) {
        return { outcome: 'skipped' };
    }

    const { _id, duration, fileSize, r2Key, standardizedDisplayName } = recording;
    const recordingId = _id.toString();

    if (recording.transcriptionStatus === 'completed') {
        logger.info(`[startAutoTranscriptionForRecording] Skipped for ${recordingId}: already completed`);
        return { outcome: 'skipped' };
    }

    if (recording.transcriptionStatus === 'processing') {
        logger.info(`[startAutoTranscriptionForRecording] Skipped for ${recordingId}: already processing`);
        return { outcome: 'skipped' };
    }

    if (!isTranscriptionFileSizeAllowed(fileSize)) {
        const reason = buildTranscriptionFileSizeError(fileSize);
        logger.warn(`[startAutoTranscriptionForRecording] Skipped for ${recordingId}: ${reason}`);
        await updateRecording(recordingId, authSubject, { transcriptionStatus: 'failed' });
        await createNotification(
            user._id,
            'warning',
            'Transcription Skipped',
            `Skipped "${standardizedDisplayName}" because it exceeds the ${MAX_TRANSCRIPTION_FILE_SIZE_LABEL} transcription limit.`,
            buildRecordingNotificationLink(recordingId)
        );
        return { outcome: 'skipped' };
    }

    const providerId: TranscriptionProviderId = resolveTranscriptionProvider(user);
    const modelId = user.transcriptionSettings?.defaultModel;
    if (!TranscriptionFactory.isProviderAvailable(providerId)) return { outcome: 'skipped' };

    const multiplier = await getProviderMultiplier(providerId);
    const costDuration = Math.ceil(calculateBilledDuration(duration) * multiplier);
    const transcriptionAccess = await checkTranscriptionAccess(user, costDuration);
    if (!transcriptionAccess.allowed) {
        logger.warn(`[startAutoTranscriptionForRecording] Skipped: ${transcriptionAccess.reason}`);
        await updateRecording(recordingId, authSubject, { transcriptionStatus: 'failed' });
        await createNotification(
            user._id,
            'warning',
            'Transcription Skipped',
            transcriptionAccess.reason || `Skipped "${standardizedDisplayName}".`,
            buildRecordingNotificationLink(recordingId)
        );
        return { outcome: 'skipped' };
    }

    logger.info(`[startAutoTranscriptionForRecording] Starting ${providerId} for ${recordingId}`);

    const claimed = await claimRecordingForTranscription(recordingId, authSubject, {
        transcriptionProvider: providerId,
        transcriptionModel: modelId,
        transcriptionCostMultiplier: multiplier,
    });
    if (!claimed) return { outcome: 'skipped' };

    const fileUrl = await getTranscriptionAudioUrl(providerId, r2Key);
    const transcriptionService = TranscriptionFactory.getService(providerId);

    if (providerId === 'elevenlabs' && duration > 300 && transcriptionService instanceof ElevenLabsService) {
        const asyncResult = await transcriptionService.transcribeAsync(fileUrl, {
            durationSeconds: duration,
            model: modelId,
            webhookMetadata: { recordingId, authSubject }
        });

        await updateRecording(recordingId, authSubject, {
            externalTranscriptionId: asyncResult.transcriptionId || asyncResult.requestId
        });
        return { outcome: 'started_async' };
    }

    if (providerId === 'soniox' && duration > 300 && transcriptionService instanceof SonioxService) {
        const asyncResult = await transcriptionService.transcribeAsync(fileUrl, {
            durationSeconds: duration,
            model: modelId,
            webhookMetadata: { recordingId, authSubject }
        });

        await updateRecording(recordingId, authSubject, {
            externalTranscriptionId: asyncResult.transcriptionId || asyncResult.requestId
        });
        return { outcome: 'started_async' };
    }

    const result = await transcriptionService.transcribe(fileUrl, {
        durationSeconds: duration,
        model: modelId
    });

    await updateRecording(recordingId, authSubject, {
        fullTranscript: result.segments,
        languageCode: result.languageCode,
        transcriptionStatus: 'processing',
        transcriptionModel: result.model,
    });

    let summary = '';
    let transliteratedSegments = result.segments;
    let summaryEmbedding: number[] = [];

    if (result.text && result.text.trim()) {
        try {
            const [summaryResult, translitResult] = await Promise.all([
                getAiService().generateSummary(result.text, result.languageCode),
                getAiService().generateTransliteration(result.segments, result.languageCode)
            ]);

            summary = summaryResult;
            transliteratedSegments = translitResult;

            if (summary) {
                summaryEmbedding = await getAiService().generateEmbedding(summary);
            }
        } catch (aiError) {
            logger.error(`[startAutoTranscriptionForRecording] AI processing failed for ${recordingId}:`, aiError);
        }
    }

    await updateRecording(recordingId, authSubject, {
        transcriptionStatus: 'completed',
        fullTranscript: transliteratedSegments,
        languageCode: result.languageCode,
        summary,
        summaryEmbedding,
    });

    const usageReportId = `${providerId}:${result.transcriptionId}`;
    const shouldReportUsage = await markTranscriptionUsageReported(recordingId, authSubject, usageReportId);
    if (shouldReportUsage) {
        const billedDuration = calculateBilledDuration(duration);
        const billedCostDuration = Math.ceil(billedDuration * multiplier);

        await incrementTranscriptionUsed(authSubject, billedCostDuration);
        await reportUsage(authSubject, 'transcription', billedDuration, {
            multiplier,
            identifier: `transcription:${authSubject}:recording:${recordingId}:auto:${providerId}:${result.transcriptionId}`,
        });
    }

    try {
        await transcriptionService.deleteTranscript(result.transcriptionId);
    } catch (cleanupError) {
        logger.warn(`[startAutoTranscriptionForRecording] Cleanup failed for ${recordingId}:`, cleanupError);
    }

    try {
        await createNotification(
            user._id,
            'success',
            'Transcription Ready',
            `Your recording "${standardizedDisplayName}" has been processed successfully.`,
            buildRecordingNotificationLink(recordingId)
        );
    } catch (notificationError) {
        logger.warn(`[startAutoTranscriptionForRecording] Notification failed for ${recordingId}:`, notificationError);
    }

    return { outcome: 'completed' };
}

export async function startAutoTranscriptionForRecording(
    authSubject: string,
    recordingId: string
): Promise<AutoTranscriptionResult> {
    const [user, recording] = await Promise.all([
        findUserByAuthSubject(authSubject),
        getRecordingById(recordingId, authSubject),
    ]);

    if (!user) {
        logger.warn(`[startAutoTranscriptionForRecording] Skipped for ${recordingId}: user not found`);
        return { outcome: 'skipped' };
    }

    if (!recording) {
        logger.warn(`[startAutoTranscriptionForRecording] Skipped for ${recordingId}: recording not found`);
        return { outcome: 'skipped' };
    }

    try {
        return await runAutoTranscription(authSubject, recording, user);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown transcription error';
        await markAutoTranscriptionFailed(authSubject, recordingId, recording.standardizedDisplayName, errorMessage);
        throw error;
    }
}

import { findUserByFirebaseUid } from '@/lib/db/users';
import { markTranscriptionUsageReported, updateRecording } from '@/lib/db/recordings';
import { logger } from '@/lib/logger';
import { checkTranscriptionAccess } from '@/lib/access-control';
import { getProviderMultiplier } from '@/app/actions/transcription-providers';
import { TranscriptionFactory, TranscriptionProviderId } from '@/services/transcription/factory';
import { getSignedR2Url } from '@/lib/r2';
import { ElevenLabsService } from '@/services/transcription/elevenlabs-service';
import { SonioxService } from '@/services/transcription/soniox-service';
import { GeminiService } from '@/services/ai/gemini-service';
import { createNotification } from '@/lib/notifications';
import { calculateBilledDuration } from '@/lib/utils/billing';
import { reportUsage } from '@/lib/stripe/usage';
import { incrementTranscriptionUsed } from '@/lib/db/users';
import {
    buildTranscriptionFileSizeError,
    isTranscriptionFileSizeAllowed,
    MAX_TRANSCRIPTION_FILE_SIZE_LABEL,
} from '@/lib/transcription-limits';

const aiService = new GeminiService();

export type AutoTranscriptionResult = {
    outcome: 'skipped' | 'started_async' | 'completed';
};

export async function markAutoTranscriptionJobFailed(
    firebaseUid: string,
    recordingId: string,
    standardizedDisplayName: string,
    errorMessage?: string
) {
    await updateRecording(recordingId, firebaseUid, { transcriptionStatus: 'failed' });

    const user = await findUserByFirebaseUid(firebaseUid);
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

export async function triggerAutoTranscription(
    firebaseUid: string,
    recordingId: string,
    r2Key: string,
    duration: number,
    fileSize: number,
    fileName: string,
    standardizedDisplayName: string
) : Promise<AutoTranscriptionResult> {
    const user = await findUserByFirebaseUid(firebaseUid);
    if (!user?.transcriptionSettings?.autoTranscribe) {
        return { outcome: 'skipped' };
    }

    if (!isTranscriptionFileSizeAllowed(fileSize)) {
        const reason = buildTranscriptionFileSizeError(fileSize);
        logger.warn(`[triggerAutoTranscription] Skipped for ${recordingId}: ${reason}`);
        await updateRecording(recordingId, firebaseUid, { transcriptionStatus: 'failed' });
        await createNotification(
            user._id,
            'warning',
            'Transcription Skipped',
            `Skipped "${standardizedDisplayName}" because it exceeds the ${MAX_TRANSCRIPTION_FILE_SIZE_LABEL} transcription limit.`,
            `/?id=${recordingId}`
        );
        return { outcome: 'skipped' };
    }

    let providerId: TranscriptionProviderId = user.transcriptionSettings?.defaultProvider || 'soniox';
    const modelId = user.transcriptionSettings?.defaultModel;
    if (!['soniox', 'elevenlabs'].includes(providerId)) {
        providerId = 'soniox';
    }

    const multiplier = await getProviderMultiplier(providerId);
    const costDuration = duration * multiplier;
    const transcriptionAccess = await checkTranscriptionAccess(user, costDuration);
    if (!transcriptionAccess.allowed) {
        logger.warn(`[triggerAutoTranscription] Skipped: ${transcriptionAccess.reason}`);
        await updateRecording(recordingId, firebaseUid, { transcriptionStatus: 'failed' });
        await createNotification(
            user._id,
            'warning',
            'Transcription Skipped',
            transcriptionAccess.reason || `Skipped "${standardizedDisplayName}".`,
            `/?id=${recordingId}`
        );
        return { outcome: 'skipped' };
    }

    logger.info(`[triggerAutoTranscription] Starting ${providerId} for ${recordingId}`);

    await updateRecording(recordingId, firebaseUid, {
        transcriptionStatus: 'processing',
        transcriptionProvider: providerId,
        transcriptionModel: modelId,
        transcriptionCostMultiplier: multiplier,
    });

    const fileUrl = await getSignedR2Url(r2Key, 1800);
    const transcriptionService = TranscriptionFactory.getService(providerId);

    if (providerId === 'elevenlabs' && duration > 300 && transcriptionService instanceof ElevenLabsService) {
        const asyncResult = await transcriptionService.transcribeAsync(fileUrl, {
            durationSeconds: duration,
            model: modelId,
            webhookMetadata: { recordingId, firebaseUid }
        });

        await updateRecording(recordingId, firebaseUid, {
            externalTranscriptionId: asyncResult.transcriptionId || asyncResult.requestId
        });
        return { outcome: 'started_async' };
    }

    if (providerId === 'soniox' && duration > 300 && transcriptionService instanceof SonioxService) {
        const asyncResult = await transcriptionService.transcribeAsync(fileUrl, {
            durationSeconds: duration,
            model: modelId,
            webhookMetadata: { recordingId, firebaseUid }
        });

        await updateRecording(recordingId, firebaseUid, {
            externalTranscriptionId: asyncResult.transcriptionId || asyncResult.requestId
        });
        return { outcome: 'started_async' };
    }

    const result = await transcriptionService.transcribe(fileUrl, {
        durationSeconds: duration,
        model: modelId
    });

    await updateRecording(recordingId, firebaseUid, {
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
                aiService.generateSummary(result.text, result.languageCode),
                aiService.generateTransliteration(result.segments, result.languageCode)
            ]);

            summary = summaryResult;
            transliteratedSegments = translitResult;

            if (summary) {
                summaryEmbedding = await aiService.generateEmbedding(summary);
            }
        } catch (aiError) {
            logger.error(`[triggerAutoTranscription] AI processing failed for ${recordingId}:`, aiError);
        }
    }

    await updateRecording(recordingId, firebaseUid, {
        transcriptionStatus: 'completed',
        fullTranscript: transliteratedSegments,
        languageCode: result.languageCode,
        summary,
        summaryEmbedding,
    });

    const usageReportId = `${providerId}:${result.transcriptionId}`;
    const shouldReportUsage = await markTranscriptionUsageReported(recordingId, firebaseUid, usageReportId);
    if (shouldReportUsage) {
        const billedDuration = calculateBilledDuration(duration);
        const billedCostDuration = billedDuration * multiplier;

        await incrementTranscriptionUsed(firebaseUid, billedCostDuration);
        await reportUsage(firebaseUid, 'transcription', billedDuration, {
            multiplier,
            identifier: `transcription:${firebaseUid}:recording:${recordingId}:auto:${providerId}:${result.transcriptionId}`,
        });
    }

    try {
        await transcriptionService.deleteTranscript(result.transcriptionId);
    } catch (cleanupError) {
        logger.warn(`[triggerAutoTranscription] Cleanup failed for ${recordingId}:`, cleanupError);
    }

    try {
        await createNotification(
            user._id,
            'success',
            'Transcription Ready',
            `Your recording "${standardizedDisplayName}" has been processed successfully.`,
            `/?id=${recordingId}`
        );
    } catch (notificationError) {
        logger.warn(`[triggerAutoTranscription] Notification failed for ${recordingId}:`, notificationError);
    }

    return { outcome: 'completed' };
}

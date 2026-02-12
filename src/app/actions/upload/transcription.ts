import { findUserByFirebaseUid } from '@/lib/db/users';
import { updateRecording } from '@/lib/db/recordings';
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

const aiService = new GeminiService();

export async function triggerAutoTranscription(
    firebaseUid: string,
    recordingId: string,
    r2Key: string,
    duration: number,
    fileName: string,
    standardizedDisplayName: string
) {
    try {
        const user = await findUserByFirebaseUid(firebaseUid);
        if (!user?.transcriptionSettings?.autoTranscribe) return;

        // Determine Provider and Model
        let providerId: TranscriptionProviderId = user.transcriptionSettings?.defaultProvider || 'soniox';
        const modelId = user.transcriptionSettings?.defaultModel;

        // Validation
        if (!['soniox', 'elevenlabs'].includes(providerId)) {
            providerId = 'soniox';
        }

        // Check Access
        const multiplier = await getProviderMultiplier(providerId);
        const costDuration = duration * multiplier;

        const transcriptionAccess = await checkTranscriptionAccess(user, costDuration);
        if (!transcriptionAccess.allowed) {
            logger.warn(`[triggerAutoTranscription] Skipped: ${transcriptionAccess.reason}`);
            await updateRecording(recordingId, firebaseUid, { transcriptionStatus: 'failed' });
            return;
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

        // ASYNC PATH: ElevenLabs > 300s
        if (providerId === 'elevenlabs' && duration > 300 && transcriptionService instanceof ElevenLabsService) {
            const asyncResult = await transcriptionService.transcribeAsync(fileUrl, {
                durationSeconds: duration,
                model: modelId,
                webhookMetadata: { recordingId, firebaseUid }
            });

            await updateRecording(recordingId, firebaseUid, {
                externalTranscriptionId: asyncResult.transcriptionId || asyncResult.requestId
            });
            return;
        }

        // ASYNC PATH: Soniox > 300s
        if (providerId === 'soniox' && duration > 300 && transcriptionService instanceof SonioxService) {
            const asyncResult = await transcriptionService.transcribeAsync(fileUrl, {
                durationSeconds: duration,
                model: modelId,
                webhookMetadata: { recordingId, firebaseUid }
            });

            await updateRecording(recordingId, firebaseUid, {
                externalTranscriptionId: asyncResult.transcriptionId || asyncResult.requestId
            });
            return;
        }

        // SYNC PATH
        const result = await transcriptionService.transcribe(fileUrl, {
            durationSeconds: duration,
            model: modelId
        });

        // Save Raw Transcript
        await updateRecording(recordingId, firebaseUid, {
            fullTranscript: result.segments,
            languageCode: result.languageCode,
            transcriptionStatus: 'processing',
            transcriptionModel: result.model,
        });

        // AI Processing
        let summary = '';
        let transliteratedSegments = result.segments;
        let summaryEmbedding: number[] = [];

        if (result.text && result.text.trim()) {
            const [summaryResult, translitResult] = await Promise.all([
                aiService.generateSummary(result.text, result.languageCode),
                aiService.generateTransliteration(result.segments, result.languageCode)
            ]);

            summary = summaryResult;
            transliteratedSegments = translitResult;

            if (summary) {
                summaryEmbedding = await aiService.generateEmbedding(summary);
            }
        }

        // Finalize
        await updateRecording(recordingId, firebaseUid, {
            transcriptionStatus: 'completed',
            fullTranscript: transliteratedSegments,
            languageCode: result.languageCode,
            summary,
            summaryEmbedding,
        });

        // Billing
        const billedDuration = calculateBilledDuration(duration);
        const billedCostDuration = billedDuration * multiplier;

        await incrementTranscriptionUsed(firebaseUid, billedCostDuration);
        await reportUsage(firebaseUid, 'transcription', billedDuration, { multiplier });

        // Cleanup
        await transcriptionService.deleteTranscript(result.transcriptionId);

        // Notify
        await createNotification(
            user._id,
            'success',
            'Transcription Ready',
            `Your recording "${standardizedDisplayName || fileName}" has been processed successfully.`,
            `/?id=${recordingId}`
        );

    } catch (error) {
        logger.error(`[triggerAutoTranscription] Failed for ${recordingId}:`, error);
        await updateRecording(recordingId, firebaseUid, { transcriptionStatus: 'failed' });

        // Notify Error
        // Need user ID here, we fetched user at start.
        // If user fetch failed we returned early anyway.
        // However, user object might be stale if we relied on `user` var from top of try block
        // inside strict scope.
        // We can re-fetch or use what we had if valid.
        /*
           Wait, if `user` is undefined we return. 
           If error happens after, `user` is defined.
           The user._id is ObjectId.
        */
        const user = await findUserByFirebaseUid(firebaseUid);
        if (user) {
            await createNotification(
                user._id,
                'error',
                'Transcription Failed',
                `Processing failed for "${fileName}".`,
            );
        }
    }
}

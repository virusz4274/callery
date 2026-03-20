import { logger } from '@/lib/logger';
import { resolveExternalServiceIncident, safelyReportExternalServiceIncident } from '@/lib/external-service-incidents';
import { getConfiguredPublicAppOrigin } from '@/lib/public-url';
import type { TranscribeAsyncOptions, TranscribeAsyncResult } from '../types';
import type { SonioxConfig } from './soniox-api-types';
import { env } from '@/lib/env';

export async function startAsyncTranscription(
    config: SonioxConfig,
    fileUrl: string,
    options?: TranscribeAsyncOptions,
    model?: string
): Promise<TranscribeAsyncResult> {
    const modelToUse = options?.model || model;
    const appUrl = getConfiguredPublicAppOrigin();
    const webhookSecret = env.SONIOX_WEBHOOK_SECRET;

    let webhookUrl = `${appUrl}/api/webhooks/soniox`;
    if (options?.webhookMetadata) {
        const params = new URLSearchParams();
        params.set('recordingId', options.webhookMetadata.recordingId);
        params.set('firebaseUid', options.webhookMetadata.firebaseUid);
        webhookUrl += `?${params.toString()}`;
    }

    const requestBody: Record<string, unknown> = {
        audio_url: fileUrl,
        model: modelToUse,
        enable_speaker_diarization: true,
        webhook_url: webhookUrl,
    };

    requestBody.webhook_auth_header_name = 'X-Soniox-Secret';
    requestBody.webhook_auth_header_value = webhookSecret;

    try {
        const response = await fetch(`${config.baseUrl}/v1/transcriptions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error(`[Soniox] Async API Error (${response.status}): ${errorText}`);
            const apiError = new Error(`Soniox API failed: ${response.status} ${errorText}`) as Error & {
                status?: number;
                incidentReported?: boolean;
            };
            apiError.status = response.status;
            await safelyReportExternalServiceIncident({
                provider: 'soniox',
                service: 'Soniox API',
                operation: 'start_async_transcription',
                error: apiError,
                context: {
                    fileUrl,
                    model: modelToUse,
                },
                notifyAdmins: true,
            });
            apiError.incidentReported = true;
            throw apiError;
        }

        const data = await response.json();
        const transcriptionId = data.id;

        logger.info(`[Soniox] Async request submitted. Transcription ID: ${transcriptionId}`);
        await resolveExternalServiceIncident({
            provider: 'soniox',
            operation: 'start_async_transcription',
        });

        return {
            requestId: transcriptionId,
            transcriptionId,
            message: 'Transcription queued for processing',
        };
    } catch (error) {
        if (!(error instanceof Error && 'incidentReported' in error && error.incidentReported)) {
            await safelyReportExternalServiceIncident({
                provider: 'soniox',
                service: 'Soniox API',
                operation: 'start_async_transcription',
                error,
                context: {
                    fileUrl,
                    model: modelToUse,
                },
                notifyAdmins: true,
            });
        }
        throw error;
    }
}

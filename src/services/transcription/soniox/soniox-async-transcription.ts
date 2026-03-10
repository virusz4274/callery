import { logger } from '@/lib/logger';
import type { TranscribeAsyncOptions, TranscribeAsyncResult } from '../types';
import type { SonioxConfig } from './soniox-api-types';

export async function startAsyncTranscription(
    config: SonioxConfig,
    fileUrl: string,
    options?: TranscribeAsyncOptions,
    model?: string
): Promise<TranscribeAsyncResult> {
    const modelToUse = options?.model || model;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9000';
    const webhookSecret = process.env.SONIOX_WEBHOOK_SECRET;

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

    if (webhookSecret) {
        requestBody.webhook_auth_header_name = 'X-Soniox-Secret';
        requestBody.webhook_auth_header_value = webhookSecret;
    }

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
        throw new Error(`Soniox API failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const transcriptionId = data.id;

    logger.info(`[Soniox] Async request submitted. Transcription ID: ${transcriptionId}`);

    return {
        requestId: transcriptionId,
        transcriptionId,
        message: 'Transcription queued for processing',
    };
}

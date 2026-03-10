import { logSystemEvent } from '@/lib/db/system-log';
import { logger } from '@/lib/logger';
import type { SonioxConfig } from './soniox-api-types';

export async function startTranscription(
    config: SonioxConfig,
    fileUrl: string,
    model: string
): Promise<string> {
    const response = await fetch(`${config.baseUrl}/v1/transcriptions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            audio_url: fileUrl,
            model,
            enable_speaker_diarization: true,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        logger.error(`[Soniox] Start Error (${response.status}): ${errorText}`);

        if (response.status === 402 || response.status === 429 || (response.status === 403 && errorText.includes('quota'))) {
            await logSystemEvent(
                'SONIOX_BILLING_ERROR',
                {
                    status: response.status,
                    error: errorText,
                    timestamp: new Date().toISOString(),
                },
                'SONIOX_SERVICE',
                'SYSTEM'
            );

            throw new Error('Transcription service temporarily unavailable due to quota limits.');
        }

        throw new Error(`Failed to start Soniox transcription: ${response.status}`);
    }

    const data = await response.json();
    if (!data.id) {
        logger.error('[Soniox] No transcription ID in response:', data);
        throw new Error('No transcription_id returned from Soniox');
    }

    return data.id;
}

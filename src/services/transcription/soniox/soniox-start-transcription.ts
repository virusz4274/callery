import { logSystemEvent } from '@/lib/db/system-log';
import { resolveExternalServiceIncident, safelyReportExternalServiceIncident } from '@/lib/external-service-incidents';
import { logger } from '@/lib/logger';
import type { SonioxConfig } from './soniox-api-types';

export async function startTranscription(
    config: SonioxConfig,
    fileUrl: string,
    model: string
): Promise<string> {
    try {
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
            const apiError = new Error(`Failed to start Soniox transcription: ${response.status} ${errorText}`) as Error & {
                status?: number;
                incidentReported?: boolean;
            };
            apiError.status = response.status;

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

                await safelyReportExternalServiceIncident({
                    provider: 'soniox',
                    service: 'Soniox API',
                    operation: 'start_transcription',
                    error: apiError,
                    context: {
                        fileUrl,
                        model,
                    },
                    notifyAdmins: true,
                });
                (apiError as Error & { incidentReported?: boolean }).incidentReported = true;

                const quotaError = new Error('Transcription service temporarily unavailable due to quota limits.') as Error & {
                    incidentReported?: boolean;
                    status?: number;
                };
                quotaError.incidentReported = true;
                quotaError.status = response.status;
                throw quotaError;
            }

            await safelyReportExternalServiceIncident({
                provider: 'soniox',
                service: 'Soniox API',
                operation: 'start_transcription',
                error: apiError,
                context: {
                    fileUrl,
                    model,
                },
                notifyAdmins: true,
            });
            apiError.incidentReported = true;

            throw apiError;
        }

        const data = await response.json();
        if (!data.id) {
            logger.error('[Soniox] No transcription ID in response:', data);
            throw new Error('No transcription_id returned from Soniox');
        }

        await resolveExternalServiceIncident({
            provider: 'soniox',
            operation: 'start_transcription',
        });

        return data.id;
    } catch (error) {
        if (!(error instanceof Error && 'incidentReported' in error && error.incidentReported)) {
            await safelyReportExternalServiceIncident({
                provider: 'soniox',
                service: 'Soniox API',
                operation: 'start_transcription',
                error,
                context: {
                    fileUrl,
                    model,
                },
                notifyAdmins: true,
            });
        }
        throw error;
    }
}

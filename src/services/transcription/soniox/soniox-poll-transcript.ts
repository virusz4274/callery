import { logger } from '@/lib/logger';
import { resolveExternalServiceIncident, safelyReportExternalServiceIncident } from '@/lib/external-service-incidents';
import type { SonioxPollResponse } from '../types';
import type { SonioxConfig } from './soniox-api-types';

export async function pollCompletedTranscript(
    config: SonioxConfig,
    transcriptionId: string,
    durationSeconds?: number
): Promise<SonioxPollResponse> {
    const initialWaitMs = durationSeconds ? Math.min(durationSeconds * 0.3 * 1000, 30000) : 2000;
    const safeWaitMs = Math.max(initialWaitMs, 2000);

    logger.debug(
        `[Soniox] Smart Polling: Waiting ${safeWaitMs}ms before first check (Duration: ${durationSeconds || '?'}s)`
    );

    let resultData: SonioxPollResponse | null = null;
    let status = 'QUEUED';
    let attempts = 0;
    const maxAttempts = 500;

    try {
        await new Promise((resolve) => setTimeout(resolve, safeWaitMs));

        while (attempts < maxAttempts) {
            if (attempts > 0) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }
            attempts++;

            const pollResponse = await fetch(`${config.baseUrl}/v1/transcriptions/${transcriptionId}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${config.apiKey}` },
            });

            if (!pollResponse.ok) {
                logger.warn(`[Soniox] Polling failed: ${pollResponse.status}`);
                continue;
            }

            const data = (await pollResponse.json()) as SonioxPollResponse;
            status = (data.status || 'UNKNOWN').toUpperCase();

            if (status === 'COMPLETED') {
                logger.info(`[Soniox] Transcription status is COMPLETED at attempt ${attempts}. Fetching full transcript...`);

                const transcriptResponse = await fetch(`${config.baseUrl}/v1/transcriptions/${transcriptionId}/transcript`, {
                    method: 'GET',
                    headers: { Authorization: `Bearer ${config.apiKey}` },
                });

                if (!transcriptResponse.ok) {
                    const errorText = await transcriptResponse.text();
                    logger.error(`[Soniox] Failed to fetch transcript data (${transcriptResponse.status}): ${errorText}`);
                    const apiError = new Error(`Failed to fetch Soniox transcript data: ${transcriptResponse.status} ${errorText}`) as Error & {
                        status?: number;
                        incidentReported?: boolean;
                    };
                    apiError.status = transcriptResponse.status;
                    await safelyReportExternalServiceIncident({
                        provider: 'soniox',
                        service: 'Soniox API',
                        operation: 'poll_transcript',
                        error: apiError,
                        context: {
                            transcriptionId,
                        },
                        notifyAdmins: true,
                    });
                    apiError.incidentReported = true;
                    throw apiError;
                }

                resultData = (await transcriptResponse.json()) as SonioxPollResponse;
                logger.info(`[Soniox] Successfully fetched transcript data. Tokens: ${resultData.tokens?.length || 0}`);
                await resolveExternalServiceIncident({
                    provider: 'soniox',
                    operation: 'poll_transcript',
                });
                break;
            }

            if (status === 'FAILED') {
                logger.error('[Soniox] Transcription status FAILED:', data.error_message);
                const pollingError = new Error(`Soniox transcription failed: ${data.error_message || 'Unknown error'}`) as Error & {
                    incidentReported?: boolean;
                };
                await safelyReportExternalServiceIncident({
                    provider: 'soniox',
                    service: 'Soniox API',
                    operation: 'poll_transcript',
                    error: pollingError,
                    context: {
                        transcriptionId,
                        pollingStatus: status,
                    },
                    notifyAdmins: true,
                });
                pollingError.incidentReported = true;
                throw pollingError;
            }

            if (attempts % 10 === 0) {
                logger.debug(`[Soniox] Still waiting for ${transcriptionId}... (Status: ${status})`);
            }
        }

        if (!resultData) {
            logger.error(`[Soniox] Polling timed out or failed after ${attempts} attempts`);
            const timeoutError = new Error('Transcription timed out or did not complete successfully.') as Error & {
                incidentReported?: boolean;
            };
            await safelyReportExternalServiceIncident({
                provider: 'soniox',
                service: 'Soniox API',
                operation: 'poll_transcript',
                error: timeoutError,
                context: {
                    transcriptionId,
                    attempts,
                },
                notifyAdmins: true,
            });
            timeoutError.incidentReported = true;
            throw timeoutError;
        }

        return resultData;
    } catch (error) {
        if (!(error instanceof Error && 'incidentReported' in error && error.incidentReported)) {
            await safelyReportExternalServiceIncident({
                provider: 'soniox',
                service: 'Soniox API',
                operation: 'poll_transcript',
                error,
                context: {
                    transcriptionId,
                    attempts,
                },
                notifyAdmins: true,
            });
        }
        throw error;
    }
}

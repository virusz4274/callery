import { logger } from '@/lib/logger';
import { resolveExternalServiceIncident, safelyReportExternalServiceIncident } from '@/lib/external-service-incidents';
import type { SonioxConfig } from './soniox-api-types';

export async function deleteTranscript(config: SonioxConfig, transcriptionId: string): Promise<void> {
    if (!transcriptionId) {
        return;
    }

    try {
        const response = await fetch(`${config.baseUrl}/v1/transcriptions/${transcriptionId}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
            },
        });

        if (!response.ok) {
            if (response.status === 404) {
                logger.warn(`[Soniox] Transcript ${transcriptionId} not found (already deleted?)`);
                return;
            }
            logger.error(`[Soniox] Failed to delete transcript: ${response.status}`);
            const apiError = new Error(`Failed to delete Soniox transcript: ${response.status}`) as Error & { status?: number };
            apiError.status = response.status;
            await safelyReportExternalServiceIncident({
                provider: 'soniox',
                service: 'Soniox API',
                operation: 'delete_transcript',
                error: apiError,
                context: {
                    transcriptionId,
                },
                notifyAdmins: true,
            });
            return;
        }

        await resolveExternalServiceIncident({
            provider: 'soniox',
            operation: 'delete_transcript',
        });
    } catch (error) {
        logger.error('[Soniox] Delete Error:', error);
        await safelyReportExternalServiceIncident({
            provider: 'soniox',
            service: 'Soniox API',
            operation: 'delete_transcript',
            error,
            context: {
                transcriptionId,
            },
            notifyAdmins: true,
        });
    }
}

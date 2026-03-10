import { logger } from '@/lib/logger';
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
        }
    } catch (error) {
        logger.error('[Soniox] Delete Error:', error);
    }
}

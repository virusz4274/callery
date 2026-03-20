import {
    ITranscriptionService,
    TranscribeAsyncOptions,
    TranscribeAsyncResult,
    TranscribeOptions,
    TranscriptionResult,
} from './types';
import { safelyReportExternalServiceIncident } from '@/lib/external-service-incidents';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { deleteTranscript as deleteSonioxTranscript, pollCompletedTranscript, startAsyncTranscription, startTranscription } from '@/services/transcription/soniox/api';
import { processWordsIntoSegments } from '@/services/transcription/soniox/processing';

export class SonioxService implements ITranscriptionService {
    private apiKey: string;
    private baseUrl: string;
    private model: string;
    public readonly provider = 'soniox';

    constructor() {
        this.apiKey = env.SONIOX_API_KEY;
        this.baseUrl = env.SONIOX_API_BASE_URL;
        this.model = env.SONIOX_MODEL_ID;
    }

    private getConfig() {
        return {
            apiKey: this.apiKey,
            baseUrl: this.baseUrl,
        };
    }

    async transcribe(fileUrl: string, options?: TranscribeOptions): Promise<TranscriptionResult> {
        if (!this.apiKey) {
            const configError = new Error('SONIOX_API_KEY is not defined');
            await safelyReportExternalServiceIncident({
                provider: this.provider,
                service: 'Soniox API',
                operation: 'transcribe',
                error: configError,
                notifyAdmins: true,
            });
            throw configError;
        }

        const durationSeconds = options?.durationSeconds;
        const modelToUse = this.model;

        try {
            logger.debug(`[Soniox] Requesting transcription for: ${fileUrl}`);

            const transcriptionId = await startTranscription(this.getConfig(), fileUrl, modelToUse);
            logger.info(`[Soniox] Started transcription ID: ${transcriptionId}`);

            const resultData = await pollCompletedTranscript(this.getConfig(), transcriptionId, durationSeconds);

            logger.debug('[Soniox] Beginning result processing...');
            const words = resultData.tokens || resultData.words || [];
            const segments = processWordsIntoSegments(words);

            const detectedLanguage = resultData.detected_language || 'unknown';
            logger.info(`[Soniox] Processed ${segments.length} segments. Language: ${detectedLanguage}`);

            const fullText = resultData.text || segments.map((segment) => segment.text).join(' ');

            return {
                text: fullText,
                languageCode: detectedLanguage,
                segments,
                transcriptionId,
                provider: 'soniox',
                model: modelToUse,
            };
        } catch (error) {
            logger.error('[Soniox] Transcription Error:', error);
            throw error;
        }
    }

    async transcribeAsync(fileUrl: string, options?: TranscribeAsyncOptions): Promise<TranscribeAsyncResult> {
        if (!this.apiKey) {
            const configError = new Error('SONIOX_API_KEY is not defined');
            await safelyReportExternalServiceIncident({
                provider: this.provider,
                service: 'Soniox API',
                operation: 'transcribe_async',
                error: configError,
                notifyAdmins: true,
            });
            throw configError;
        }

        const modelToUse = options?.model || this.model;

        try {
            logger.info(`[Soniox] Starting ASYNC transcription for: ${fileUrl} (Model: ${modelToUse})`);
            return await startAsyncTranscription(this.getConfig(), fileUrl, options, modelToUse);
        } catch (error) {
            logger.error('[Soniox] Async Transcription Error:', error);
            throw error;
        }
    }

    async deleteTranscript(transcriptionId: string): Promise<void> {
        await deleteSonioxTranscript(this.getConfig(), transcriptionId);
    }
}

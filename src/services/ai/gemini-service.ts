import { TranscriptionSegment } from '@/lib/db/types';
import { IAIService, AiStepContext } from './types';
import { getGeminiClient, hasGeminiKey } from './client';
import { buildSummaryPrompt, buildTransliterationPrompt, mergeTransliteration } from './prompts';
import { logAiStepFailure } from './failure-events';
import { logger } from '@/lib/logger';

export class GeminiService implements IAIService {
    constructor() {
        if (!hasGeminiKey()) {
            logger.warn('GOOGLE_GENERATIVE_AI_API_KEY is not defined. AI features will be disabled.');
        }
    }

    async generateSummary(transcript: string, languageCode: string, context?: AiStepContext): Promise<string> {
        if (!hasGeminiKey()) return '';
        if (!transcript || !transcript.trim()) return '';

        const prompt = buildSummaryPrompt(transcript, languageCode);
        const model = process.env.GEMINI_MODEL_SUMMARY || 'gemini-2.0-flash-lite-preview-02-05'; // Updated to newer model as default if not set

        try {
            const result = await getGeminiClient().models.generateContent({
                model,
                contents: prompt,
            });
            return result.text || '';
        } catch (error) {
            logger.error('Error generating summary:', error);
            await logAiStepFailure(error, { step: 'summary', provider: 'gemini', model, context });
            // Fallback to empty string on error to not block flow
            return '';
        }
    }

    async generateTransliteration(
        segments: TranscriptionSegment[],
        languageCode: string,
        context?: AiStepContext
    ): Promise<TranscriptionSegment[]> {
        if (!hasGeminiKey()) return segments;
        if (!segments || segments.length === 0) return segments;

        const prompt = buildTransliterationPrompt(segments, languageCode);
        const model = process.env.GEMINI_MODEL_TRANSLITERATION || 'gemini-2.0-flash-lite-preview-02-05';

        try {
            const result = await getGeminiClient().models.generateContent({
                model,
                contents: prompt,
                config: {
                    responseMimeType: "application/json"
                }
            });

            const responseText = result.text;
            if (!responseText) return segments;

            return mergeTransliteration(segments, JSON.parse(responseText) as unknown);

        } catch (error) {
            logger.error('Error generating transliteration:', error);
            await logAiStepFailure(error, { step: 'transliteration', provider: 'gemini', model, context });
            return segments;
        }
    }

    async generateEmbedding(text: string, context?: AiStepContext): Promise<number[]> {
        if (!hasGeminiKey() || !text) return [];

        const model = 'gemini-embedding-001';
        try {
            const result = await getGeminiClient().models.embedContent({
                model,
                contents: text,
            });
            return result.embeddings?.[0]?.values || [];
        } catch (error) {
            logger.error('Error generating embedding:', error);
            await logAiStepFailure(error, { step: 'embedding', provider: 'gemini', model, context });
            return [];
        }
    }
}

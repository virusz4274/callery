import { TranscriptionSegment } from '@/lib/db/types';
import { IAIService, AiStepContext } from './types';
import { getGeminiClient, hasGeminiKey } from './client';
import { buildSummaryPrompt, buildTransliterationPrompt, mergeTransliteration } from './prompts';
import { logAiStepFailure } from './failure-events';
import { logger } from '@/lib/logger';
import { geminiModel } from '@/lib/config';

export class GeminiService implements IAIService {
    constructor() {
        if (!hasGeminiKey()) {
            logger.warn('GOOGLE_GENERATIVE_AI_API_KEY is not defined. AI features will be disabled.');
        }
    }

    private extractFirstJsonArray(text: string): string | null {
        const trimmed = text.trim();
        const arrayStart = trimmed.indexOf('[');

        if (arrayStart === -1) {
            return null;
        }

        let depth = 0;
        let inString = false;
        let isEscaped = false;

        for (let index = arrayStart; index < trimmed.length; index += 1) {
            const character = trimmed[index];

            if (inString) {
                if (isEscaped) {
                    isEscaped = false;
                    continue;
                }

                if (character === '\\') {
                    isEscaped = true;
                    continue;
                }

                if (character === '"') {
                    inString = false;
                }

                continue;
            }

            if (character === '"') {
                inString = true;
                continue;
            }

            if (character === '[') {
                depth += 1;
                continue;
            }

            if (character !== ']') {
                continue;
            }

            depth -= 1;
            if (depth === 0) {
                return trimmed.slice(arrayStart, index + 1);
            }
        }

        return null;
    }

    private parseTransliterationSegments(responseText: string): TranscriptionSegment[] {
        const candidates = [responseText.trim()];
        const extractedJsonArray = this.extractFirstJsonArray(responseText);

        if (extractedJsonArray && extractedJsonArray !== candidates[0]) {
            candidates.push(extractedJsonArray);
        }

        let lastError: unknown;

        for (const candidate of candidates) {
            try {
                const parsed = JSON.parse(candidate) as unknown;

                if (!Array.isArray(parsed)) {
                    throw new Error('Gemini transliteration response was not a JSON array');
                }

                return parsed as TranscriptionSegment[];
            } catch (error) {
                lastError = error;
            }
        }

        throw lastError instanceof Error ? lastError : new Error('Failed to parse Gemini transliteration response');
    }

    async generateSummary(transcript: string, languageCode: string, context?: AiStepContext): Promise<string> {
        if (!hasGeminiKey()) return '';
        if (!transcript || !transcript.trim()) return '';

        const prompt = buildSummaryPrompt(transcript, languageCode);
        const model = geminiModel('summary');

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
        const model = geminiModel('transliteration');

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

            return mergeTransliteration(segments, this.parseTransliterationSegments(responseText));

        } catch (error) {
            logger.error('Error generating transliteration:', error);
            await logAiStepFailure(error, { step: 'transliteration', provider: 'gemini', model, context });
            return segments;
        }
    }

    async generateEmbedding(text: string, context?: AiStepContext): Promise<number[]> {
        if (!hasGeminiKey() || !text) return [];

        const model = geminiModel('embedding');
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

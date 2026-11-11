import { TranscriptionSegment } from '@/lib/db/types';
import { IAIService, AiStepContext, type PlannedAiRequest } from './types';
import { ThinkingLevel } from '@google/genai';
import { getGeminiClient, hasGeminiKey } from './client';
import { AI_LIMITS, buildSummaryPrompt, buildTransliterationPrompt, mergeTransliteration, truncateUtf8 } from './prompts';
import { logAiStepFailure } from './failure-events';
import { logger } from '@/lib/logger';
import { geminiModel } from '@/lib/config';
import { assertAiCallAuthorized, geminiUsage } from './usage';

export class GeminiService implements IAIService {
    async countInputTokens(model: string, contents: string): Promise<number> {
        const result = await getGeminiClient().models.countTokens({ model, contents });
        if (!Number.isSafeInteger(result.totalTokens) || result.totalTokens! < 0) throw new Error('The provider did not return a verified input token count.');
        return result.totalTokens!;
    }

    private planned(context: AiStepContext | undefined, step: 'summary' | 'transliteration' | 'embedding'): PlannedAiRequest | undefined {
        const request = context?.plannedRequest;
        if (request && (request.provider !== 'gemini' || !request.model || request.inputTokens > (step === 'embedding' ? AI_LIMITS.embeddingInputTokens : AI_LIMITS.inputTokens)
            || request.maxOutputTokens > (step === 'summary' ? AI_LIMITS.summaryOutputTokens : step === 'embedding' ? 0 : AI_LIMITS.transliterationOutputTokens))) {
            throw new Error('The planned AI request is incompatible with this transport.');
        }
        return request;
    }
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

        const planned = this.planned(context, 'summary');
        const prompt = planned?.prompt ?? buildSummaryPrompt(transcript, languageCode);
        const model = planned?.model ?? geminiModel('summary');

        try {
            assertAiCallAuthorized('gemini', model, 'summary', context);
            const result = await getGeminiClient().models.generateContent({
                model,
                contents: prompt,
                config: { maxOutputTokens: planned?.maxOutputTokens ?? AI_LIMITS.summaryOutputTokens, automaticContinuation: false,
                    ...(planned ? { thinkingConfig: planned.thinking === 'minimal' ? { thinkingLevel: ThinkingLevel.MINIMAL } : { thinkingBudget: 0 } } : {}) },
            });
            await context?.onUsage?.({ ...geminiUsage(model, 'summary', result.usageMetadata, result.responseId), actualModel: result.modelVersion });
            if (context?.throwOnError && (!result.text?.trim() || (planned && result.candidates?.[0]?.finishReason !== 'STOP'))) throw new Error('Summary response was empty, incomplete, or truncated.');
            return result.text || '';
        } catch (error) {
            logger.error('Error generating summary:', error);
            await logAiStepFailure(error, { step: 'summary', provider: 'gemini', model, context });
            if (context?.throwOnError) throw error;
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

        const planned = this.planned(context, 'transliteration');
        const prompt = planned?.prompt ?? buildTransliterationPrompt(segments, languageCode);
        const model = planned?.model ?? geminiModel('transliteration');

        try {
            assertAiCallAuthorized('gemini', model, 'transliteration', context);
            const result = await getGeminiClient().models.generateContent({
                model,
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    maxOutputTokens: planned?.maxOutputTokens ?? AI_LIMITS.transliterationOutputTokens,
                    automaticContinuation: false,
                    ...(planned ? { thinkingConfig: planned.thinking === 'minimal' ? { thinkingLevel: ThinkingLevel.MINIMAL } : { thinkingBudget: 0 } } : {}),
                }
            });
            await context?.onUsage?.({ ...geminiUsage(model, 'transliteration', result.usageMetadata, result.responseId), actualModel: result.modelVersion });

            const responseText = result.text;
            if (planned && result.candidates?.[0]?.finishReason !== 'STOP') throw new Error('Transliteration response was incomplete or truncated.');
            if (!responseText) {
                if (context?.throwOnError) throw new Error('Transliteration response was empty or truncated.');
                return segments;
            }

            return mergeTransliteration(segments, this.parseTransliterationSegments(responseText));

        } catch (error) {
            logger.error('Error generating transliteration:', error);
            await logAiStepFailure(error, { step: 'transliteration', provider: 'gemini', model, context });
            if (context?.throwOnError) throw error;
            return segments;
        }
    }

    async generateEmbedding(text: string, context?: AiStepContext): Promise<number[]> {
        if (!hasGeminiKey() || !text) return [];

        const planned = this.planned(context, 'embedding');
        const model = planned?.model ?? geminiModel('embedding');
        try {
            assertAiCallAuthorized('gemini', model, 'embedding', context);
            const boundedText = planned?.prompt ?? truncateUtf8(text, AI_LIMITS.embeddingInputTokens - 16);
            const result = await getGeminiClient().models.embedContent({
                model,
                contents: boundedText,
                ...((planned?.embedding || context?.embedding) ? { config: {
                    taskType: (planned?.embedding || context?.embedding)!.purpose === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
                    outputDimensionality: (planned?.embedding || context?.embedding)!.dimensions,
                } } : {}),
            });
            // The Gemini embedding endpoint supplies no token usage on the
            // Developer API. Retain that fact; settlement uses the reserved cap.
            await context?.onUsage?.({ provider: 'gemini', model, step: 'embedding', measured: false,
                ...(planned ? { inputTokens: planned.inputTokens, outputTokens: 0 } : {}) });
            const values = result.embeddings?.[0]?.values;
            if (!values?.length || !values.every(value => Number.isFinite(value))) throw new Error('Embedding response had no finite numeric vector');
            if ((planned?.embedding || context?.embedding) && values.length !== (planned?.embedding || context?.embedding)!.dimensions) throw new Error('Embedding dimensions differ from the accepted search profile.');
            return values;
        } catch (error) {
            logger.error('Error generating embedding:', error);
            await logAiStepFailure(error, { step: 'embedding', provider: 'gemini', model, context });
            if (context?.throwOnError) throw error;
            return [];
        }
    }
}

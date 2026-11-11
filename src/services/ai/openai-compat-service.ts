import { TranscriptionSegment } from '@/lib/db/types';
import { compatTextConfig } from '@/lib/config';
import { IAIService, AiStepContext, type AiStep } from './types';
import { AI_LIMITS, buildSummaryPrompt, buildTransliterationPrompt, mergeTransliteration, truncateUtf8 } from './prompts';
import { logAiStepFailure } from './failure-events';
import { logger } from '@/lib/logger';
import { assertAiCallAuthorized, compatUsage } from './usage';

interface ChatCompletionResponse {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: unknown;
    id?: string;
}

interface EmbeddingsResponse {
    data?: { embedding?: unknown }[];
    usage?: unknown;
}

/**
 * IAIService over any OpenAI-compatible chat + embeddings server
 * (Ollama, vLLM, OpenRouter, OpenAI itself, ...). Same prompts and graceful
 * degradation as the Gemini backend; only the transport differs.
 */
export class OpenAiCompatService implements IAIService {
    constructor() {
        if (!compatTextConfig()) {
            logger.warn(
                'OPENAI_COMPAT_BASE_URL / OPENAI_COMPAT_CHAT_MODEL / OPENAI_COMPAT_EMBEDDING_MODEL are not all set. AI features will be disabled.',
            );
        }
    }

    private headers(): Record<string, string> {
        const cfg = compatTextConfig();
        return {
            'Content-Type': 'application/json',
            ...(cfg?.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        };
    }

    private async chat(prompt: string, step: Exclude<AiStep, 'embedding'>, context?: AiStepContext): Promise<string> {
        const cfg = compatTextConfig();
        if (!cfg) return '';
        const planned = context?.plannedRequest;
        const model = planned?.model ?? cfg.chatModel;
        if (planned && (planned.provider !== 'openai_compat' || planned.inputTokens > AI_LIMITS.inputTokens)) throw new Error('The planned AI request is incompatible with this transport.');
        assertAiCallAuthorized('openai_compat', model, step, context);
        const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: planned?.prompt ?? prompt }],
                max_completion_tokens: planned?.maxOutputTokens ?? (step === 'summary' ? AI_LIMITS.summaryOutputTokens : AI_LIMITS.transliterationOutputTokens),
            }),
            signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok) {
            throw new Error(`Chat completions failed: ${response.status}`);
        }
        const data = (await response.json()) as ChatCompletionResponse;
        await context?.onUsage?.(compatUsage(model, step, data.usage, data.id));
        if (planned && data.choices?.[0]?.finish_reason !== 'stop') throw new Error('AI response was incomplete or truncated.');
        if (context?.throwOnError && !data.choices?.[0]?.message?.content?.trim()) throw new Error('AI response was empty or truncated.');
        return data.choices?.[0]?.message?.content || '';
    }

    async generateSummary(transcript: string, languageCode: string, context?: AiStepContext): Promise<string> {
        const cfg = compatTextConfig();
        if (!cfg) return '';
        if (!transcript || !transcript.trim()) return '';

        try {
            return await this.chat(buildSummaryPrompt(transcript, languageCode), 'summary', context);
        } catch (error) {
            logger.error('Error generating summary (compat):', error);
            await logAiStepFailure(error, { step: 'summary', provider: 'openai_compat', model: cfg.chatModel, context });
            if (context?.throwOnError) throw error;
            return '';
        }
    }

    async generateTransliteration(
        segments: TranscriptionSegment[],
        languageCode: string,
        context?: AiStepContext,
    ): Promise<TranscriptionSegment[]> {
        const cfg = compatTextConfig();
        if (!cfg) return segments;
        if (!segments || segments.length === 0) return segments;

        try {
            const responseText = await this.chat(buildTransliterationPrompt(segments, languageCode), 'transliteration', context);
            if (!responseText) return segments;
            // Local models often wrap JSON in markdown fences despite the prompt.
            const json = responseText.trim().replace(/^```(?:json)?\n?|\n?```$/g, '');
            return mergeTransliteration(segments, JSON.parse(json) as unknown);
        } catch (error) {
            logger.error('Error generating transliteration (compat):', error);
            await logAiStepFailure(error, { step: 'transliteration', provider: 'openai_compat', model: cfg.chatModel, context });
            if (context?.throwOnError) throw error;
            return segments;
        }
    }

    async generateEmbedding(text: string, context?: AiStepContext): Promise<number[]> {
        const cfg = compatTextConfig();
        if (!cfg || !text) return [];

        try {
            const planned = context?.plannedRequest;
            const model = planned?.model ?? cfg.embeddingModel;
            if (planned && (planned.provider !== 'openai_compat' || planned.inputTokens > AI_LIMITS.embeddingInputTokens)) throw new Error('The planned embedding request is incompatible with this transport.');
            assertAiCallAuthorized('openai_compat', model, 'embedding', context);
            const response = await fetch(`${cfg.baseUrl}/embeddings`, {
                method: 'POST',
                headers: this.headers(),
                body: JSON.stringify({ model, input: planned?.prompt ?? truncateUtf8(text, AI_LIMITS.embeddingInputTokens - 16) }),
                signal: AbortSignal.timeout(60_000),
            });
            if (!response.ok) {
                throw new Error(`Embeddings failed: ${response.status}`);
            }
            const data = (await response.json()) as EmbeddingsResponse;
            await context?.onUsage?.(compatUsage(model, 'embedding', data.usage));
            const values = data.data?.[0]?.embedding;
            if (!Array.isArray(values) || !values.length || !values.every((v) => typeof v === 'number' && Number.isFinite(v))) {
                throw new Error('Embeddings response had no numeric vector');
            }
            if ((planned?.embedding || context?.embedding) && values.length !== (planned?.embedding || context?.embedding)!.dimensions) throw new Error('Embedding dimensions differ from the accepted search profile.');
            return values as number[];
        } catch (error) {
            logger.error('Error generating embedding (compat):', error);
            await logAiStepFailure(error, { step: 'embedding', provider: 'openai_compat', model: cfg.embeddingModel, context });
            if (context?.throwOnError) throw error;
            return [];
        }
    }
}

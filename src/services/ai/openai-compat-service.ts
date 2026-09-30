import { TranscriptionSegment } from '@/lib/db/types';
import { compatTextConfig } from '@/lib/config';
import { IAIService, AiStepContext } from './types';
import { buildSummaryPrompt, buildTransliterationPrompt, mergeTransliteration } from './prompts';
import { logAiStepFailure } from './failure-events';
import { logger } from '@/lib/logger';

interface ChatCompletionResponse {
    choices?: { message?: { content?: string } }[];
}

interface EmbeddingsResponse {
    data?: { embedding?: unknown }[];
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

    private async chat(prompt: string): Promise<string> {
        const cfg = compatTextConfig();
        if (!cfg) return '';
        const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({
                model: cfg.chatModel,
                messages: [{ role: 'user', content: prompt }],
            }),
        });
        if (!response.ok) {
            throw new Error(`Chat completions failed: ${response.status}`);
        }
        const data = (await response.json()) as ChatCompletionResponse;
        return data.choices?.[0]?.message?.content || '';
    }

    async generateSummary(transcript: string, languageCode: string, context?: AiStepContext): Promise<string> {
        const cfg = compatTextConfig();
        if (!cfg) return '';
        if (!transcript || !transcript.trim()) return '';

        try {
            return await this.chat(buildSummaryPrompt(transcript, languageCode));
        } catch (error) {
            logger.error('Error generating summary (compat):', error);
            await logAiStepFailure(error, { step: 'summary', provider: 'openai_compat', model: cfg.chatModel, context });
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
            const responseText = await this.chat(buildTransliterationPrompt(segments, languageCode));
            if (!responseText) return segments;
            // Local models often wrap JSON in markdown fences despite the prompt.
            const json = responseText.trim().replace(/^```(?:json)?\n?|\n?```$/g, '');
            return mergeTransliteration(segments, JSON.parse(json) as unknown);
        } catch (error) {
            logger.error('Error generating transliteration (compat):', error);
            await logAiStepFailure(error, { step: 'transliteration', provider: 'openai_compat', model: cfg.chatModel, context });
            return segments;
        }
    }

    async generateEmbedding(text: string, context?: AiStepContext): Promise<number[]> {
        const cfg = compatTextConfig();
        if (!cfg || !text) return [];

        try {
            const response = await fetch(`${cfg.baseUrl}/embeddings`, {
                method: 'POST',
                headers: this.headers(),
                body: JSON.stringify({ model: cfg.embeddingModel, input: text }),
            });
            if (!response.ok) {
                throw new Error(`Embeddings failed: ${response.status}`);
            }
            const data = (await response.json()) as EmbeddingsResponse;
            const values = data.data?.[0]?.embedding;
            if (!Array.isArray(values) || !values.every((v) => typeof v === 'number')) {
                throw new Error('Embeddings response had no numeric vector');
            }
            return values as number[];
        } catch (error) {
            logger.error('Error generating embedding (compat):', error);
            await logAiStepFailure(error, { step: 'embedding', provider: 'openai_compat', model: cfg.embeddingModel, context });
            return [];
        }
    }
}

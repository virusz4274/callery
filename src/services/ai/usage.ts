import type { GenerateContentResponseUsageMetadata } from '@google/genai';
import { billingEnabled } from '@/lib/config';
import type { AiStep, AiStepContext, AiUsage } from './types';

export function assertAiCallAuthorized(provider: AiUsage['provider'], model: string, step: AiStep, context?: AiStepContext) {
    if (!billingEnabled()) return;
    // Server-created execution context provides request provenance, not a monetary hold.
    if (context?.plannedRequest && (context.plannedRequest.maxOutputTokens < 0 || (step === 'embedding' && context.plannedRequest.maxOutputTokens !== 0) || context.plannedRequest.provider !== provider || context.plannedRequest.model !== model)) throw new Error('The AI model differs from its accepted request.');
    if (!context?.authSubject || !context.onUsage || !context.reservationId || !context.fundingSource) {
        throw new Error('Managed AI requires an owned execution call before contacting the provider.');
    }
}

function tokens(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export function geminiUsage(model: string, step: AiStep, value?: GenerateContentResponseUsageMetadata, requestId?: string): AiUsage {
    const inputTokens = tokens(value?.promptTokenCount);
    const candidates = tokens(value?.candidatesTokenCount);
    const thoughtTokens = tokens(value?.thoughtsTokenCount) ?? 0;
    return { provider: 'gemini', model, step, inputTokens,
        outputTokens: candidates,
        cachedInputTokens: tokens(value?.cachedContentTokenCount), thoughtTokens,
        ...(requestId ? { requestId } : {}), measured: inputTokens !== undefined && candidates !== undefined };
}

export function compatUsage(model: string, step: AiStep, value: unknown, requestId?: string): AiUsage {
    const usage = value as { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown;
        prompt_tokens_details?: { cached_tokens?: unknown }; completion_tokens_details?: { reasoning_tokens?: unknown } } | undefined;
    const inputTokens = tokens(usage?.prompt_tokens);
    const completion = tokens(usage?.completion_tokens);
    const thoughtTokens = tokens(usage?.completion_tokens_details?.reasoning_tokens) ?? 0;
    const outputTokens = step === 'embedding' ? 0 : completion === undefined ? undefined : Math.max(0, completion - thoughtTokens);
    return { provider: 'openai_compat', model, step, inputTokens, outputTokens,
        cachedInputTokens: tokens(usage?.prompt_tokens_details?.cached_tokens),
        thoughtTokens,
        ...(requestId ? { requestId } : {}), measured: inputTokens !== undefined && outputTokens !== undefined };
}

import { aiProvider, compatTextConfig, geminiModel } from '@/lib/config';
import { AI_LIMITS } from '@/services/ai/prompts';
import type { AiStep } from '@/services/ai/types';
import type { ManagedCostPolicy } from './economics';
import type { ProcessingAiModel, ProcessingTranscriptEnvelope } from './legacy-processing-budget';

const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** The same selected models and token prices feed publication and admission. */
export function processingCostModels(policy?: Partial<ManagedCostPolicy>, allowUnpriced = false): Record<AiStep, ProcessingAiModel> {
    const provider = aiProvider();
    if (provider !== 'gemini' && !allowUnpriced) throw new Error('Paid and finite operator workflows require an AI adapter with verified model token counting. Configure the supported Gemini adapter before publishing or starting work.');
    return Object.fromEntries((['summary', 'transliteration', 'embedding'] as const).map(step => {
        const model = provider === 'gemini' ? geminiModel(step) : step === 'embedding' ? compatTextConfig()?.embeddingModel : compatTextConfig()?.chatModel;
        if (!model) throw new Error('Configure each bundled AI model before processing.');
        const rate = policy?.ai?.[`${provider}:${model}:${step}`] || policy?.ai?.[`${provider}:${model}`];
        if (!rate || !nonnegative(rate.inputUsdMicrosPerMillionTokens) || !nonnegative(rate.outputUsdMicrosPerMillionTokens)) {
            if (!allowUnpriced) throw new Error('The complete AI workflow requires audited costs for every selected model.');
            return [step, { provider, model, unpriced: true }];
        }
        return [step, { provider, model, rate }];
    })) as Record<AiStep, ProcessingAiModel>;
}
export function assertExternalProcessingBound(envelope: ProcessingTranscriptEnvelope | undefined, context?: { provider: string; model: string }): asserts envelope is ProcessingTranscriptEnvelope {
    const proof = envelope?.externalBoundProof;
    if (!envelope || !proof || !['provider_enforced', 'provider_contract'].includes(proof.kind) || typeof proof.reference !== 'string' || !proof.reference.trim()
        || typeof proof.verifiedBy !== 'string' || !proof.verifiedBy.trim() || !Number.isFinite(Date.parse(proof.verifiedAt)) || Date.parse(proof.verifiedAt) > Date.now()
        || !Number.isFinite(Date.parse(proof.expiresAt)) || Date.parse(proof.expiresAt) <= Date.now()
        || !nonnegative(envelope.externalAsrCostBoundMicros) || envelope.externalAsrCostBoundMicros <= 0) throw new Error('Verify the complete processing envelope and external provider charge bound before publishing or accepting paid work.');
    for (const name of ['maxResponseBytes', 'maxSourceTextBytes', 'maxSegments', 'maxWords', 'maxSummaryLeaves', 'maxReduceLevels', 'maxTransliterationChunks'] as const) {
        if (!nonnegative(envelope[name]) || envelope[name] <= 0) throw new Error('The processing envelope is incomplete or invalid.');
    }
    if (envelope.maxAsrOutputTokens !== undefined && (!nonnegative(envelope.maxAsrOutputTokens) || envelope.maxAsrOutputTokens <= 0 || envelope.maxAsrOutputTokens > 65_536)) throw new Error('The ASR output token bound is invalid.');
    if (context?.provider === 'gemini' && envelope.maxAsrOutputTokens === undefined) throw new Error('Gemini processing requires an explicit transmitted ASR token ceiling.');
    if (proof.kind === 'provider_enforced') {
        const configuration = proof.enforcedConfiguration;
        if (!context || !configuration || configuration.provider !== context.provider || configuration.model !== context.model
            || configuration.maxAsrOutputTokens !== envelope.maxAsrOutputTokens) throw new Error('The external processing proof does not match the transmitted provider configuration.');
    }
}
export function processingAiCostBound(envelope: ProcessingTranscriptEnvelope, models: Record<AiStep, ProcessingAiModel>): number {
    const cap = (step: AiStep, count: number, output: number) => {
        const rate = models[step].rate;
        if (!rate) return 0;
        const input = step === 'embedding' ? AI_LIMITS.embeddingInputTokens : AI_LIMITS.inputTokens;
        return count * AI_LIMITS.attempts * Math.ceil((input * rate.inputUsdMicrosPerMillionTokens + output * rate.outputUsdMicrosPerMillionTokens) / 1_000_000);
    };
    const cost = cap('summary', envelope.maxSummaryLeaves * 2, AI_LIMITS.summaryOutputTokens)
        + cap('transliteration', envelope.maxTransliterationChunks, AI_LIMITS.transliterationOutputTokens) + cap('embedding', 1, 0);
    if (!Number.isSafeInteger(cost) || cost < 0) throw new Error('The complete processing reservation exceeds the supported accounting range.');
    return cost;
}

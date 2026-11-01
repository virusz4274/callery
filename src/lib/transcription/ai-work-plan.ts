import { createHash } from 'node:crypto';
import { aiProvider, geminiApiKey, compatTextConfig, geminiModel } from '@/lib/config';
import type { TranscriptionSegment } from '@/lib/db/types';
import type { FundingSource } from '@/lib/stripe/funding-source';
import { CURRENT_AI_PLANNER_VERSION, type AiPlannerVersion, type ProcessingAiModel, type ProcessingTranscriptEnvelope } from './processing-policy';
import { AI_LIMITS, AI_PROMPT_V1, AI_PROMPT_VERSION, buildSummaryPrompt, buildTransliterationPrompt, truncateUtf8 } from '@/services/ai/prompts';
import type { AiStep, AiUsage, IAIService, PlannedAiRequest } from '@/services/ai/types';
import { ProcessingError } from './processing-errors';

const bytes = (text: string) => Buffer.byteLength(text, 'utf8');
export const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const transcriptRevision = (segments: TranscriptionSegment[]) => fingerprint(segments.map(({ text, speakerId, start, end, words }) => ({ text, speakerId, start, end, words })));
const SUMMARY_SOURCE_BYTES = 1024;
const TRANSLITERATION_SOURCE_BYTES = 512;
const SUMMARY_INTERMEDIATE_TOKENS = 192;

export interface AiPlannedCall extends PlannedAiRequest {
    step: AiStep;
    /** @deprecated Historical work-plan evidence only. */
    maximumCostMicros?: number;
    sourceIndexes?: number[];
    inputCountBasis?: 'provider_tokenizer' | 'utf8_byte_bound';
}
export interface AiCallCheckpoint {
    attempts: number;
    state: 'prepared' | 'started' | 'response_saved' | 'completed' | 'failed' | 'unknown';
    reservationId: string;
    request: AiPlannedCall;
    /** Content is deliberately in the recording, never in financial journals. */
    result?: string | number[] | string[];
    usage?: AiUsage;
    actualCostMicros?: number;
    error?: string;
}
export interface AiWorkPlan {
    version: AiPlannerVersion; id: string; transcriptRevision: string; parentReceiptId: string;
    fundingSource: FundingSource; promptVersion: string; createdAt: string;
    aiModels: Record<AiStep, ProcessingAiModel>;
    /** @deprecated Historical work-plan evidence only. */
    maximumCostMicros?: number; unpriced?: boolean;
    summaryLeaves: { call: AiPlannedCall; source: string; sourceIndexes: number[] }[];
    transliterationChunks: { call: AiPlannedCall; segments: TranscriptionSegment[]; sources: { index: number; part: number }[] }[];
    passthroughIndexes: number[];
    maximumReduceCalls: number;
}

function configurationError(message: string, step: AiStep = 'summary'): ProcessingError {
    return new ProcessingError(message, { stage: step, state: 'blocked', code: 'processing_configuration', retryAction: 'contact_admin', providerOutcome: 'not_started' });
}

export function processingModels(): Record<AiStep, ProcessingAiModel> {
    const provider = aiProvider();
    return Object.fromEntries((['summary', 'transliteration', 'embedding'] as const).map(step => {
        const model = provider === 'gemini' ? geminiModel(step) : step === 'embedding' ? compatTextConfig()?.embeddingModel : compatTextConfig()?.chatModel;
        if (!model) throw new ProcessingError('Configure every bundled AI model before processing.', { stage: step, state: 'blocked', code: 'provider_configuration', retryAction: 'contact_admin', providerOutcome: 'not_started' });
        return [step, { provider, model }];
    })) as Record<AiStep, ProcessingAiModel>;
}

/** These are service limits, not an invented claim about a provider's bill. */
export function defaultTranscriptEnvelope(durationSeconds: number): ProcessingTranscriptEnvelope {
    const maxSourceTextBytes = Math.min(256 * 1024, Math.max(4096, Math.ceil(durationSeconds * 64)));
    const maxSegments = Math.min(20_000, Math.ceil(durationSeconds * 4) + 32);
    return { maxResponseBytes: maxSourceTextBytes * 12, maxSourceTextBytes, maxAsrOutputTokens: 8192,
        maxSegments, maxWords: Math.min(100_000, Math.ceil(durationSeconds * 8) + 128),
        maxSummaryLeaves: Math.ceil((maxSourceTextBytes + maxSegments) / SUMMARY_SOURCE_BYTES) + 1, maxReduceLevels: 9,
        maxTransliterationChunks: Math.ceil(maxSourceTextBytes / TRANSLITERATION_SOURCE_BYTES) + maxSegments };
}

/** Pin service limits before ASR without requiring financial cost attestations. */
export function buildPreflightExecutionLimits(input: { fundingSource: FundingSource; provider: string; model: string; durationSeconds: number; fileSize: number }) {
    const aiModels = processingModels();
    if (aiModels.summary.provider === 'gemini' ? !geminiApiKey() : !compatTextConfig()) throw new ProcessingError('Configure every bundled AI provider before starting transcription.',
        { stage: 'transcription', state: 'blocked', code: 'provider_configuration', retryAction: 'contact_admin', providerOutcome: 'not_started' });
    return { aiModels, transcriptEnvelope: defaultTranscriptEnvelope(input.durationSeconds) };
}

export function assertTranscriptEnvelope(segments: TranscriptionSegment[], envelope: ProcessingTranscriptEnvelope, stage: 'transcription' | 'summary' = 'transcription') {
    if (bytes(JSON.stringify(segments)) > envelope.maxResponseBytes || segments.length > envelope.maxSegments
        || segments.reduce((n, s) => n + bytes(s.text), 0) > envelope.maxSourceTextBytes
        || segments.reduce((n, s) => n + s.words.length, 0) > envelope.maxWords) {
        throw new ProcessingError('The provider transcript exceeds the accepted processing envelope. Review before acceptance or further AI calls.',
            { stage, state: stage === 'transcription' ? 'needs_review' : 'blocked', code: 'transcript_envelope_exceeded', retryAction: 'contact_admin', providerOutcome: stage === 'transcription' ? 'responded' : 'not_started' });
    }
}

export async function planAiCall(input: { id: string; step: AiStep; prompt: string; model: ProcessingAiModel; service: IAIService; maximumOutputTokens: number; managed: boolean; sourceIndexes?: number[]; allowPhysicalInputBound?: boolean; promptVersion?: string }): Promise<AiPlannedCall> {
    let inputTokens: number;
    let inputCountBasis: AiPlannedCall['inputCountBasis'] = 'provider_tokenizer';
    try {
        if (input.service.countInputTokens) inputTokens = await input.service.countInputTokens(input.model.model, input.prompt);
        else { inputTokens = bytes(input.prompt); inputCountBasis = 'utf8_byte_bound'; } // Conservative physical token envelope; not financial evidence
    } catch (error) { throw configurationError(error instanceof Error ? error.message : 'Input token counting failed.', input.step); }
    const limit = input.step === 'embedding' ? AI_LIMITS.embeddingInputTokens : AI_LIMITS.inputTokens;
    if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 || inputTokens > limit) throw configurationError('The exact AI request exceeds its supported input token bound.', input.step);
    return { version: 1, id: input.id, step: input.step, provider: input.model.provider as PlannedAiRequest['provider'], model: input.model.model,
        prompt: input.prompt, promptVersion: input.promptVersion ?? AI_PROMPT_VERSION, inputTokens, maxOutputTokens: input.maximumOutputTokens,
        thinking: input.model.model.startsWith('gemini-3') ? 'minimal' : 'off', inputCountBasis,
        ...(input.sourceIndexes ? { sourceIndexes: input.sourceIndexes } : {}) };
}

function splitText(text: string, maximum: number): string[] {
    const parts: string[] = [];
    let remaining = text;
    while (remaining) { const part = truncateUtf8(remaining, maximum); if (!part) throw configurationError('Unsupported source character.'); parts.push(part); remaining = remaining.slice(part.length); }
    return parts;
}

export interface AiWorkPlanInput {
    segments: TranscriptionSegment[]; language: string; parentReceiptId: string; fundingSource: FundingSource;
    aiModels: Record<AiStep, ProcessingAiModel>; service: IAIService; managed: boolean;
    envelope: ProcessingTranscriptEnvelope; plannerVersion?: AiPlannerVersion;
}

/** Conservative ASCII expansion plus indexed JSON output overhead. */
function transliterationOutputBound(segments: TranscriptionSegment[]): number {
    return Math.max(128, bytes(JSON.stringify(segments.map((segment, index) => [index, segment.text]))) * 4 + 64);
}

async function planTransliterationV2(input: AiWorkPlanInput): Promise<Pick<AiWorkPlan, 'transliterationChunks' | 'passthroughIndexes'>> {
    const transliterationChunks: AiWorkPlan['transliterationChunks'] = [], passthroughIndexes: number[] = [];
    let segments: TranscriptionSegment[] = [], sources: { index: number; part: number }[] = [];
    const supported = (candidate: TranscriptionSegment[]) => {
        if (transliterationOutputBound(candidate) > AI_LIMITS.transliterationOutputTokens) return false;
        try { buildTransliterationPrompt(candidate, input.language); return true; }
        catch { return false; }
    };
    const flush = async () => {
        if (!segments.length) return;
        const call = await planAiCall({ id: `transliteration-chunk-${transliterationChunks.length}`, step: 'transliteration',
            prompt: buildTransliterationPrompt(segments, input.language), model: input.aiModels.transliteration,
            service: input.service, managed: input.managed, maximumOutputTokens: transliterationOutputBound(segments),
            sourceIndexes: sources.map(source => source.index) });
        transliterationChunks.push({ call, segments, sources });
        segments = []; sources = [];
    };
    for (let index = 0; index < input.segments.length; index++) {
        const segment = input.segments[index];
        if (/^[\x00-\x7f]*$/.test(segment.text)) { passthroughIndexes.push(index); continue; }
        const pending = splitText(segment.text, TRANSLITERATION_SOURCE_BYTES);
        let part = 0;
        while (pending.length) {
            const text = pending.shift()!, candidate = { ...segment, text, words: [] };
            if (!supported([candidate])) {
                const characters = Array.from(text);
                if (characters.length < 2) throw configurationError('A source character exceeds the supported transliteration request.', 'transliteration');
                const midpoint = Math.ceil(characters.length / 2);
                pending.unshift(characters.slice(0, midpoint).join(''), characters.slice(midpoint).join(''));
                continue;
            }
            if (!supported([...segments, candidate])) await flush();
            segments.push(candidate); sources.push({ index, part: part++ });
        }
    }
    await flush();
    return { transliterationChunks, passthroughIndexes };
}

export async function buildAiWorkPlan(input: AiWorkPlanInput): Promise<AiWorkPlan> {
    assertTranscriptEnvelope(input.segments, input.envelope, 'summary');
    const version = input.plannerVersion ?? CURRENT_AI_PLANNER_VERSION;
    if (version !== 1 && version !== 2) throw configurationError('The accepted AI planner version is unsupported.');
    const promptVersion = version === 1 ? AI_PROMPT_V1 : AI_PROMPT_VERSION;
    const revision = transcriptRevision(input.segments);
    // Preserve the exact historical identity when accepted work has no version.
    const identity = fingerprint({ revision, parent: input.parentReceiptId, models: input.aiModels, prompts: promptVersion,
        ...(version === 1 ? {} : { plannerVersion: version }) });
    const sourceParts: { source: string; sourceIndexes: number[] }[] = [];
    let source = '', indexes: number[] = [];
    const flush = () => { if (source.trim()) sourceParts.push({ source, sourceIndexes: indexes }); source = ''; indexes = []; };
    input.segments.forEach((segment, index) => {
        for (const part of splitText(segment.text, SUMMARY_SOURCE_BYTES)) {
            if (bytes(source + '\n' + part) > SUMMARY_SOURCE_BYTES) flush();
            source += (source ? '\n' : '') + part; indexes.push(index);
        }
    }); flush();
    if (sourceParts.length > input.envelope.maxSummaryLeaves) throw configurationError('Summary coverage exceeds the accepted envelope.');
    const summaryLeaves: AiWorkPlan['summaryLeaves'] = [];
    for (let i = 0; i < sourceParts.length; i++) {
        const part = sourceParts[i];
        const maximumOutputTokens = sourceParts.length === 1 ? 512 : SUMMARY_INTERMEDIATE_TOKENS;
        const call = await planAiCall({ id: `summary-leaf-${i}`, step: 'summary', prompt: buildSummaryPrompt(part.source, input.language,
            { complete: true, ...(version === 2 ? { maximumOutputTokens } : {}) }), model: input.aiModels.summary,
            service: input.service, managed: input.managed, allowPhysicalInputBound: ['internal', 'selfhost'].includes(input.fundingSource), maximumOutputTokens,
            sourceIndexes: part.sourceIndexes, promptVersion });
        summaryLeaves.push({ ...part, call });
    }
    let transliterationChunks: AiWorkPlan['transliterationChunks'] = [], passthroughIndexes: number[] = [];
    // Narrow compatibility adapter: never rewrite requests for accepted v1 work.
    if (version === 1) for (let index = 0; index < input.segments.length; index++) {
        const segment = input.segments[index];
        if (/^[\x00-\x7f]*$/.test(segment.text)) { passthroughIndexes.push(index); continue; }
        const parts = splitText(segment.text, TRANSLITERATION_SOURCE_BYTES);
        for (let part = 0; part < parts.length; part++) {
            const segments = [{ ...segment, text: parts[part], words: [] }];
            const call = await planAiCall({ id: `transliteration-${index}-${part}`, step: 'transliteration', prompt: buildTransliterationPrompt(segments, input.language), model: input.aiModels.transliteration,
                service: input.service, managed: input.managed, allowPhysicalInputBound: ['internal', 'selfhost'].includes(input.fundingSource), maximumOutputTokens: Math.min(4096, Math.max(128, bytes(parts[part]) * 4 + 64)), sourceIndexes: [index], promptVersion });
            transliterationChunks.push({ call, segments, sources: [{ index, part }] });
        }
    }
    else ({ transliterationChunks, passthroughIndexes } = await planTransliterationV2(input));
    if (transliterationChunks.length > input.envelope.maxTransliterationChunks) throw configurationError('Transliteration coverage exceeds the accepted envelope.', 'transliteration');
    // Pairwise reduction needs at most leaves-1 calls; this is a request limit.
    const maximumReduceCalls = Math.max(0, summaryLeaves.length - 1);
    return { version, id: identity, transcriptRevision: revision, parentReceiptId: input.parentReceiptId, fundingSource: input.fundingSource,
        promptVersion, createdAt: new Date().toISOString(), aiModels: structuredClone(input.aiModels),
        summaryLeaves, transliterationChunks, passthroughIndexes, maximumReduceCalls };
}

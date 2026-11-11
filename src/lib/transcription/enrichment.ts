import { getRecordingById } from '@/lib/db/recordings';
import { findUserByAuthSubject } from '@/lib/db/users';
import { getAiService } from '@/services/ai';
import type { TranscriptionExecution } from './manual';
import type { UpdateRecordingInput } from '@/lib/db/types';
import { updateEnrichmentCheckpoint } from './execution';
import { billingEnabled, geminiApiKey, compatTextConfig } from '@/lib/config';
import { AI_LIMITS, AI_PROMPT_V1, AI_PROMPT_VERSION, buildSummaryPrompt } from '@/services/ai/prompts';
import type { AiStep, AiStepContext, AiUsage } from '@/services/ai/types';
import { resolveFundingSource } from '@/lib/stripe/funding-source';
import { retireLegacyProcessingBudget } from '@/lib/stripe/legacy-processing-budget';
import { prepareExecutionPolicy, getExecutionPolicy, acceptExecutionCall, recordExecutionOutcome, closeExecutionPolicy, type ExecutionPolicySnapshot } from '@/lib/stripe/execution-policy';
import { buildAiWorkPlan, defaultTranscriptEnvelope, fingerprint, planAiCall, processingModels, transcriptRevision,
    type AiCallCheckpoint, type AiPlannedCall, type AiWorkPlan } from './ai-work-plan';
import { ProcessingError, processingFailure } from './processing-errors';
import { classifyExternalServiceError } from '@/lib/external-service-incident-classification';
import { claimPassageAttempt, passageId, preparePassageRows, publishPassageGeneration, savedPassageResponse, savePassageResponse } from '@/lib/search/passages';
import { validateEmbedding } from '@/lib/search/profile';

const blocked = (message: string, stage: AiStep, code = 'processing_unavailable') => new ProcessingError(message,
    { stage, state: 'blocked', code, retryAction: 'resume_enrichment', providerOutcome: 'not_started' });
/** Continue from saved content using immutable execution limits, without charging audio again. */
export async function finishTranscriptionEnrichment(owner: string, recordingId: string, execution?: TranscriptionExecution, expectedResultAttemptId?: string): Promise<void> {
    const recording = await getRecordingById(recordingId, owner);
    if (!recording?.fullTranscript) throw blocked('The saved transcript is unavailable. Review before retrying.', 'summary', 'transcript_unavailable');
    if (expectedResultAttemptId !== undefined && recording.transcriptionResultAttemptId !== expectedResultAttemptId) {
        throw blocked('A newer transcription result owns this recording. Reload before continuing.', 'summary', 'stale_ai_plan');
    }
    const managed = billingEnabled();
    const revision = transcriptRevision(recording.fullTranscript);
    const save = async (patch: UpdateRecordingInput) => {
        const next = await updateEnrichmentCheckpoint(owner, recordingId, recording, patch, execution);
        Object.assign(recording, structuredClone(patch), { aiWorkRevision: next });
    };
    let plan = recording.aiWorkPlan;
    let policy: ExecutionPolicySnapshot | undefined;
    if (plan && plan.transcriptRevision !== revision) throw blocked('The saved AI plan belongs to another transcript revision. Review before continuing.', 'summary', 'stale_ai_plan');
    if (!plan) {
        const user = await findUserByAuthSubject(owner);
        if (!user) throw blocked('The account is unavailable for processing.', 'summary');
        const fundingSource = resolveFundingSource(user, managed);
        if (!fundingSource) throw blocked('An active processing entitlement is required before enrichment.', 'summary');
        policy = recording.transcriptionReceipt?.executionPolicy;
        const historical = recording.transcriptionReceipt?.processingBudget;
        if (!policy && historical) {
            // Reuse accepted service limits without reviving its expense allocator
            // or changing the historical audio receipt's financial discriminator.
            const envelope = historical.transcriptEnvelope;
            const pinnedModels = Object.fromEntries(Object.entries(historical.aiModels).map(([step, model]) =>
                [step, { provider: model.provider, model: model.model }])) as ExecutionPolicySnapshot['aiModels'];
            policy = { version: 1, id: historical.id, parentReceiptId: historical.parentReceiptId,
                fundingSource: historical.fundingSource, provider: historical.provider, model: historical.model,
                aiModels: pinnedModels, transcriptEnvelope: {
                    maxResponseBytes: envelope.maxResponseBytes, maxSourceTextBytes: envelope.maxSourceTextBytes,
                    maxSegments: envelope.maxSegments, maxWords: envelope.maxWords,
                    maxSummaryLeaves: envelope.maxSummaryLeaves, maxReduceLevels: envelope.maxReduceLevels,
                    maxTransliterationChunks: envelope.maxTransliterationChunks,
                    ...(envelope.maxAsrOutputTokens !== undefined ? { maxAsrOutputTokens: envelope.maxAsrOutputTokens } : {}),
                }, promptVersion: AI_PROMPT_V1, plannerVersion: 1, maximumAttempts: 2, acceptedAt: historical.acceptedAt,
                transcriptRevision: historical.transcriptRevision || revision, recordingId: historical.recordingId || recordingId,
                ...(historical.audioDurationSeconds !== undefined ? { audioDurationSeconds: historical.audioDurationSeconds } : {}),
                ...(historical.fileSize !== undefined ? { fileSize: historical.fileSize } : {}),
            };
            if (managed) policy = await prepareExecutionPolicy(owner, policy);
        }
        if (policy && policy.promptVersion !== ((policy.plannerVersion ?? 1) === 1 ? AI_PROMPT_V1 : AI_PROMPT_VERSION)) throw blocked('The accepted prompt version requires its original processing adapter.', 'summary', 'processing_configuration');
        const models = policy?.aiModels || processingModels();
        const parentReceiptId = policy?.id || `enrichment-v2:${fingerprint({ owner, recordingId, revision, models })}`;
        const service = getAiService(models.summary.provider as 'gemini' | 'openai_compat');
        plan = await buildAiWorkPlan({ segments: recording.fullTranscript, language: recording.languageCode || 'unknown', parentReceiptId,
            fundingSource: policy?.fundingSource || fundingSource, aiModels: models, service, managed,
            envelope: policy?.transcriptEnvelope || defaultTranscriptEnvelope(recording.duration || 60),
            plannerVersion: policy ? policy.plannerVersion ?? 1 : 2 });
        await save({ aiWorkPlan: plan, aiWorkCheckpoints: {}, transcriptionEnrichmentPending: true });
    }
    const acceptedPlan: AiWorkPlan = plan;
    if (managed) {
        policy ||= await getExecutionPolicy(owner, acceptedPlan.parentReceiptId);
        policy ||= await prepareExecutionPolicy(owner, { version: 1, id: acceptedPlan.parentReceiptId, parentReceiptId: acceptedPlan.parentReceiptId,
            fundingSource: acceptedPlan.fundingSource, provider: recording.transcriptionProvider || acceptedPlan.aiModels.summary.provider,
            model: recording.transcriptionModel || 'enrichment-only', aiModels: acceptedPlan.aiModels,
            transcriptEnvelope: defaultTranscriptEnvelope(recording.duration || 60), promptVersion: acceptedPlan.promptVersion, maximumAttempts: 2,
            acceptedAt: acceptedPlan.createdAt, transcriptRevision: revision, recordingId, plannerVersion: acceptedPlan.version });
    }
    const service = getAiService(acceptedPlan.aiModels.summary.provider as 'gemini' | 'openai_compat');
    const checkpoints = structuredClone(recording.aiWorkCheckpoints || {});
    const passageRefs = new Map(acceptedPlan.embeddingPassages.map(({ passage, call }) =>
        [call.id, passageId(owner, recordingId, acceptedPlan.id, passage.ordinal)]));
    const language = recording.languageCode || 'unknown';
    const settle = async (checkpoint: AiCallCheckpoint, outcome: 'completed' | 'unknown') => {
        if (managed) await recordExecutionOutcome(owner, acceptedPlan.parentReceiptId, checkpoint.reservationId, outcome);
    };
    async function persist(checkpoint: AiCallCheckpoint) {
        checkpoints[checkpoint.request.id] = structuredClone(checkpoint);
        await save({ aiWorkCheckpoints: structuredClone(checkpoints), processingStatus: { stage: checkpoint.request.step, state: 'running',
            providerOutcome: checkpoint.state === 'prepared' ? 'not_started' : checkpoint.state === 'started' ? 'unknown' : 'responded' } });
    }
    async function run<T extends string | string[]>(request: AiPlannedCall, invoke: (context: AiStepContext) => Promise<T>): Promise<T> {
        let checkpoint = checkpoints[request.id];
        if (checkpoint && fingerprint(checkpoint.request) !== fingerprint(request)) throw blocked('The planned AI request changed. Review its original checkpoint.', request.step, 'stale_ai_plan');
        const externalRef = passageRefs.get(request.id);
        if (checkpoint && externalRef) {
            const saved = await savedPassageResponse(externalRef, owner, request, checkpoint);
            if (saved) {
                validateEmbedding(saved.vector!, acceptedPlan.embeddingProfile);
                checkpoint = { ...checkpoint, resultRef: externalRef, usage: saved.response?.usage, state: 'response_saved' };
                await persist(checkpoint); await settle(checkpoint, 'completed'); checkpoint.state = 'completed'; await persist(checkpoint);
                return externalRef as T;
            }
            if (checkpoint.resultRef) throw blocked('The saved passage response is unavailable. Rebuild this recording’s search index.', 'embedding', 'search_response_unavailable');
        }
        if (checkpoint?.result !== undefined && (checkpoint.state === 'response_saved' || checkpoint.state === 'completed')) {
            if (checkpoint.state !== 'completed') { await settle(checkpoint, 'completed'); checkpoint.state = 'completed'; await persist(checkpoint); }
            return checkpoint.result as T;
        }
        if (checkpoint?.state === 'started' || checkpoint?.state === 'unknown') throw new ProcessingError('An earlier provider response is uncertain. Reconcile that attempt before spending again.',
            { stage: request.step, state: 'needs_review', code: 'provider_outcome_unknown', retryAction: 'review_provider', providerOutcome: 'unknown' });
        if (checkpoint?.state !== 'prepared' && (checkpoint?.attempts || 0) >= AI_LIMITS.attempts) throw new ProcessingError(`The ${request.step} call used its normal attempt and single retry.`,
            { stage: request.step, state: 'failed', code: 'ai_retries_exhausted', retryAction: 'contact_admin', providerOutcome: 'responded' });
        if (request.provider === 'gemini' ? !geminiApiKey() : !compatTextConfig()) throw blocked('Configure the pinned AI provider before resuming enrichment.', request.step, 'provider_configuration');
        const attempt = checkpoint?.state === 'prepared' ? checkpoint.attempts : (checkpoint?.attempts || 0) + 1;
        const reservationId = `ai-v1:${acceptedPlan.id}:${request.id}:${attempt}`;
        checkpoint = { attempts: attempt, state: 'prepared', reservationId, request };
        // Recording CAS owns the call before provider submission. A losing
        // writer cannot repeat the winning writer's request.
        await persist(checkpoint);
        try {
            if (managed) await acceptExecutionCall(owner, acceptedPlan.parentReceiptId, reservationId, fingerprint(request));
        } catch (error) {
            throw new ProcessingError(error instanceof Error ? error.message : 'Processing is unavailable.', processingFailure(error, request.step, 'not_started'));
        }
        checkpoint.state = 'started'; await persist(checkpoint);
        let usage: AiUsage | undefined;
        let responseKnown = false;
        let responsePersisted = false;
        try {
            const result = await invoke({ recordingId, authSubject: owner, throwOnError: true, reservationId, fundingSource: acceptedPlan.fundingSource,
                plannedRequest: request, onUsage: async value => { usage = value; responseKnown = true; } });
            checkpoint = { ...checkpoint, state: 'response_saved', ...(externalRef ? { resultRef: result as string } : { result }), usage };
            // Payload + completed response checkpoint commit together before any
            // journal write. A crash can recover this exact result.
            await persist(checkpoint);
            responsePersisted = true;
            await settle(checkpoint, 'completed');
            checkpoint.state = 'completed'; await persist(checkpoint);
            return result;
        } catch (error) {
            // If the payload was saved, preserve it even when settlement failed.
            if (checkpoint.state === 'response_saved' || checkpoint.state === 'completed') {
                if (!responsePersisted) throw new ProcessingError('The provider responded, but its durable result could not be confirmed. Review the saved checkpoint before retrying.',
                    { stage: request.step, state: 'needs_review', code: 'ai_response_persistence_unknown', retryAction: 'review_provider', providerOutcome: 'unknown' });
                throw new ProcessingError('The AI response is saved. Resume to finish its completion checkpoint.',
                    { stage: request.step, state: 'blocked', code: 'ai_settlement_pending', retryAction: 'resume_enrichment', providerOutcome: 'responded' });
            }
            const classification = classifyExternalServiceError(error);
            const rejected = Boolean(classification.httpStatus && classification.httpStatus >= 400 && classification.httpStatus < 500);
            const known = responseKnown || rejected;
            checkpoint = { ...checkpoint, state: known ? 'failed' : 'unknown', usage,
                error: error instanceof Error ? error.message : 'AI request failed' };
            await persist(checkpoint); await settle(checkpoint, known ? 'completed' : 'unknown');
            throw new ProcessingError(error instanceof Error ? error.message : 'AI processing failed.', { stage: request.step, state: known ? 'failed' : 'needs_review',
                code: classification.errorKind === 'quota' || classification.errorKind === 'rate_limit' ? 'provider_quota' : known ? 'ai_response_invalid' : 'provider_outcome_unknown',
                retryAction: known ? 'resume_enrichment' : 'review_provider', providerOutcome: known ? 'responded' : 'unknown' });
        }
    }
    const summaries: { text: string; coverage: number[]; id: string }[] = [];
    for (const leaf of acceptedPlan.summaryLeaves) {
        const text = await run<string>(leaf.call, async context => {
            const result = await service.generateSummary(leaf.source, language, context);
            if (!result.trim()) throw new Error('Summary response was empty.');
            return result;
        });
        summaries.push({ text, coverage: leaf.sourceIndexes, id: leaf.call.id });
    }
    let level = summaries, reductionCalls = 0, depth = 0;
    while (level.length > 1) {
        if (++depth > (policy?.transcriptEnvelope.maxReduceLevels || 9)) throw blocked('Summary reduction exceeded the accepted depth.', 'summary');
        const next: typeof summaries = [];
        for (let i = 0; i < level.length; i += 2) {
            const group = level.slice(i, i + 2);
            if (group.length === 1) { next.push(group[0]); continue; }
            if (++reductionCalls > acceptedPlan.maximumReduceCalls) throw blocked('Summary reduction exceeded the accepted call budget.', 'summary');
            const coverage = [...new Set(group.flatMap(part => part.coverage))];
            const source = group.map(part => part.text).join('\n');
            const id = `summary-reduce-${depth}-${i / 2}`;
            const cached = checkpoints[id]?.request;
            const maximumOutputTokens = level.length === 2 ? 512 : 192;
            const call = cached || await planAiCall({ id, step: 'summary', prompt: buildSummaryPrompt(source, language,
                { complete: true, reduction: true, ...(acceptedPlan.version === 2 ? { maximumOutputTokens } : {}) }),
                model: acceptedPlan.aiModels.summary, service, maximumOutputTokens, managed,
                allowPhysicalInputBound: ['internal', 'selfhost'].includes(acceptedPlan.fundingSource), sourceIndexes: coverage, promptVersion: acceptedPlan.promptVersion });
            const text = await run<string>(call, async context => {
                const result = await service.generateSummary(source, language, context);
                if (!result.trim()) throw new Error('Summary reduction response was empty.');
                return result;
            });
            next.push({ text, coverage, id });
        }
        level = next;
    }
    const summary = level[0]?.text || '';
    const sourceIndexes = acceptedPlan.summaryLeaves.flatMap(leaf => leaf.sourceIndexes);
    if (recording.fullTranscript.some((segment, index) => segment.text.trim() && !sourceIndexes.includes(index))) throw blocked('Summary source coverage is incomplete.', 'summary');
    await save({ summary, transcriptionEnrichmentSteps: { ...recording.transcriptionEnrichmentSteps, summary: true } });
    const segments = structuredClone(recording.fullTranscript);
    for (const index of acceptedPlan.passthroughIndexes) segments[index].transliteratedText = segments[index].text;
    for (const chunk of acceptedPlan.transliterationChunks) {
        const values = await run<string[]>(chunk.call, async context => {
            const enriched = await service.generateTransliteration(chunk.segments, language, context);
            if (enriched.length !== chunk.segments.length || enriched.some((segment, i) => segment.text !== chunk.segments[i].text || !segment.transliteratedText?.trim())) throw new Error('Transliteration omitted source text.');
            return enriched.map(segment => segment.transliteratedText!);
        });
        for (let i = 0; i < chunk.sources.length; i++) {
            const source = chunk.sources[i];
            segments[source.index].transliteratedText = source.part === 0 ? values[i] : `${segments[source.index].transliteratedText || ''}${values[i]}`;
        }
    }
    await save({ fullTranscript: segments, transcriptionEnrichmentSteps: { ...recording.transcriptionEnrichmentSteps, transliteration: true } });
    const searchIndex = { generation: acceptedPlan.id, transcriptRevision: revision, profileId: acceptedPlan.embeddingProfile.id,
        state: 'indexing' as const, totalPassages: acceptedPlan.embeddingPassages.length, completedPassages: 0 };
    await save({ searchIndex });
    await preparePassageRows(owner, recordingId, acceptedPlan.id, revision, acceptedPlan.embeddingProfile,
        acceptedPlan.embeddingPassages.map(item => item.passage));
    try {
        for (const { passage, call } of acceptedPlan.embeddingPassages) {
            const ref = passageRefs.get(call.id)!;
            await run<string>(call, async context => {
                await claimPassageAttempt(ref, owner, call, checkpoints[call.id]);
                let observedUsage: AiUsage | undefined;
                const vector = await service.generateEmbedding(call.prompt, { ...context, onUsage: async observed => {
                    observedUsage = observed; await context.onUsage?.(observed);
                } });
                validateEmbedding(vector, acceptedPlan.embeddingProfile);
                // The receipt and payload commit together before the parent reference or journal.
                await savePassageResponse(ref, owner, call, checkpoints[call.id], vector, observedUsage);
                return ref;
            });
            searchIndex.completedPassages = passage.ordinal + 1;
            await save({ searchIndex: { ...searchIndex } });
        }
        await publishPassageGeneration(owner, recordingId, acceptedPlan.id, searchIndex.totalPassages);
        await save({ searchIndex: { ...searchIndex, state: 'ready' }, transcriptionEnrichmentSteps: { ...recording.transcriptionEnrichmentSteps, embedding: true } });
    } catch (error) {
        await save({ searchIndex: { ...searchIndex, state: 'failed' } }).catch(() => undefined);
        throw error;
    }
    if (managed) {
        await closeExecutionPolicy(owner, acceptedPlan.parentReceiptId);
        if (recording.transcriptionReceipt?.processingBudget) {
            await retireLegacyProcessingBudget(owner, acceptedPlan.parentReceiptId, checkpoints);
            if (recording.transcriptionReceipt.id !== acceptedPlan.parentReceiptId) await retireLegacyProcessingBudget(owner, recording.transcriptionReceipt.id, checkpoints);
        }
    }
    await save({ transcriptionStatus: 'completed', transcriptionEnrichmentPending: false, transcriptionError: '',
        processingStatus: { stage: 'completed', state: 'completed', retryAction: 'none', providerOutcome: 'responded' } });
}

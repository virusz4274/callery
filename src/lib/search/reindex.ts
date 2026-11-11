import { randomUUID } from 'node:crypto';
import { ObjectId, type Db } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { Recording, User } from '@/lib/db/types';
import { billingEnabled } from '@/lib/config';
import { checkUserAccess, hasBillingIssue, isTrialExpired } from '@/lib/access-control-common';
import { assertProcessingAvailable } from '@/lib/processing-availability';
import { resolveFundingSource, type FundingSource } from '@/lib/stripe/funding-source';
import { ensurePaidBaseForNewWork } from '@/lib/stripe/ledger';
import { acceptExecutionCall, closeExecutionPolicy, prepareExecutionPolicy, recordExecutionOutcome } from '@/lib/stripe/execution-policy';
import { getAiService } from '@/services/ai';
import type { AiStepContext, AiUsage, IAIService } from '@/services/ai/types';
import { AI_LIMITS, AI_PROMPT_VERSION } from '@/services/ai/prompts';
import { assertTranscriptEnvelope, defaultTranscriptEnvelope, fingerprint, transcriptRevision, type AiCallCheckpoint, type AiPlannedCall } from '@/lib/transcription/ai-work-plan';
import { updateEnrichmentCheckpoint } from '@/lib/transcription/execution';
import type { TranscriptionExecution } from '@/lib/transcription/manual';
import { ProcessingError, processingFailure } from '@/lib/transcription/processing-errors';
import { classifyExternalServiceError } from '@/lib/external-service-incident-classification';
import { chunkTranscript } from './chunking';
import { embeddingProfile, validateEmbedding } from './profile';
import { claimPassageAttempt, passageId, preparePassageRows, publishPassageGeneration, removePassageGeneration, savedPassageResponse, savePassageResponse } from './passages';
import type { EmbeddingProfile, TranscriptPassage } from './types';

/** Saved with the recording so erasure and retention also erase request content. */
export interface SearchIndexWork {
    version: 1;
    id: string;
    transcriptRevision: string;
    profile: EmbeddingProfile;
    fundingSource: FundingSource;
    createdAt: string;
    passages: { passage: TranscriptPassage; call: AiPlannedCall }[];
    checkpoints: Record<string, AiCallCheckpoint>;
}

const review = (message: string) => new ProcessingError(message, {
    stage: 'embedding', state: 'needs_review', code: 'search_index_review', retryAction: 'contact_admin', providerOutcome: 'unknown',
});
const blocked = (message: string) => new ProcessingError(message, {
    stage: 'embedding', state: 'blocked', code: 'search_index_unavailable', retryAction: 'contact_admin', providerOutcome: 'not_started',
});

/** A crash is safe to resume only when it cannot repeat an unconfirmed call. */
export async function isSearchIndexRetrySafe(work: SearchIndexWork | undefined, owner: string, recordingId: string): Promise<boolean> {
    if (!work) return true;
    for (const checkpoint of Object.values(work.checkpoints)) {
        if (!checkpoint.resultRef && !['started', 'unknown', 'response_saved', 'completed'].includes(checkpoint.state)) continue;
        const ordinal = work.passages.find(item => item.call.id === checkpoint.request.id)?.passage.ordinal;
        if (ordinal === undefined) return false;
        const saved = await savedPassageResponse(passageId(owner, recordingId, work.id, ordinal), owner, checkpoint.request, checkpoint);
        if (!saved) return false;
        try { validateEmbedding(saved.vector!, work.profile); } catch { return false; }
    }
    return true;
}

/** Indexing is embedding-only provider work: never reserve or meter audio again. */
export async function assertSearchIndexingAccess(owner: string, db: Db): Promise<FundingSource> {
    const user = await db.collection<User>(Collections.USERS).findOne({ authSubject: owner });
    if (!user || !checkUserAccess(user).allowed) throw blocked('This account cannot start search indexing.');
    const managed = billingEnabled(), funding = resolveFundingSource(user, managed);
    if (!funding || managed && (isTrialExpired(user) || hasBillingIssue(user))) throw blocked('Resolve the account’s processing access before indexing saved transcripts.');
    if (managed) await ensurePaidBaseForNewWork(user, db);
    await assertProcessingAvailable(db);
    return funding;
}

/** Runs only inside the same durable, single-pipeline dispatcher as transcription. */
export async function runSearchIndexJob(owner: string, recordingId: string, execution: TranscriptionExecution,
    profileId: string, expectedRevision?: string, dependencies: { db?: Db; service?: IAIService } = {}): Promise<void | 'continue'> {
    const deadline = Date.now() + 45_000;
    let providerCalls = 0;
    const db = dependencies.db ?? await getMongoDb();
    const currentProfile = embeddingProfile();
    if (currentProfile.id !== profileId) throw blocked('The embedding profile changed. Queue indexing again for the current profile.');
    const fundingSource = await assertSearchIndexingAccess(owner, db);
    const recordings = db.collection<Recording>(Collections.RECORDINGS);
    const recording = await recordings.findOne({ _id: new ObjectId(recordingId), authSubject: owner });
    if (!recording?.fullTranscript?.length || recording.transcriptionStatus !== 'completed' || recording.transcriptionEnrichmentPending || recording.transcriptionQueuedJobId) {
        throw blocked('Finish this recording’s transcription before rebuilding its search index.');
    }
    const revision = transcriptRevision(recording.fullTranscript);
    if (expectedRevision && expectedRevision !== revision) throw blocked('The transcript changed. Queue indexing again for its saved revision.');
    if (recording.searchIndex?.state === 'ready' && recording.searchIndex.profileId === profileId && recording.searchIndex.transcriptRevision === revision) return;
    const assertOwned = async () => {
        const job = await db.collection<{ _id: string; owner: string; recordingId: string; kind: string; state: string; attemptId: string }>('integration_jobs').findOne({ _id: execution.jobId, owner, recordingId,
            kind: 'search_index', state: 'running', attemptId: execution.attemptId });
        const slot = await db.collection<{ _id: string; jobId: string; attemptId: string }>('transcription_dispatch').findOne({ _id: 'transcription', jobId: execution.jobId, attemptId: execution.attemptId });
        if (!job || !slot) throw blocked('This indexing attempt no longer owns the processing queue.');
    };
    const save = async (patch: Partial<Recording>) => {
        await assertOwned();
        const next = await updateEnrichmentCheckpoint(owner, recordingId, recording, patch);
        Object.assign(recording, structuredClone(patch), { aiWorkRevision: next });
    };
    await assertOwned();
    const service = dependencies.service ?? getAiService(currentProfile.provider);
    let work = recording.searchIndexWork;
    if (work && (work.profile.id !== profileId || work.transcriptRevision !== revision)) {
        if (Object.values(work.checkpoints).some(checkpoint => ['started', 'unknown'].includes(checkpoint.state))) {
            throw review('An earlier indexing provider outcome needs review before rebuilding this recording.');
        }
        work = undefined;
    }
    if (!work) {
        assertTranscriptEnvelope(recording.fullTranscript, defaultTranscriptEnvelope(recording.duration || 60), 'summary');
        const passages = await chunkTranscript(recording.fullTranscript, service.countInputTokens
            ? text => service.countInputTokens!(currentProfile.model, text) : undefined);
        // A profile can be replaced and later selected again. A fresh rebuild
        // must not reuse a closed policy or deleted passage generation from that
        // earlier cycle; retries reuse this persisted operation identity instead.
        const id = `search-index-v1:${fingerprint({ owner, recordingId, revision, profileId, operation: randomUUID() })}`;
        work = { version: 1, id, profile: currentProfile, transcriptRevision: revision, fundingSource, createdAt: new Date().toISOString(), checkpoints: {},
            passages: passages.map(passage => ({ passage, call: {
                version: 1, id: `passage-${passage.ordinal}`, step: 'embedding', provider: currentProfile.provider, model: currentProfile.model,
                prompt: passage.text, promptVersion: AI_PROMPT_VERSION, inputTokens: passage.inputTokens, maxOutputTokens: 0,
                thinking: 'off', inputCountBasis: currentProfile.countBasis,
                embedding: { purpose: 'document', dimensions: currentProfile.dimensions, profileId },
            } })) };
        await save({ searchIndexWork: work });
    }
    const accepted = work;
    const managed = billingEnabled();
    if (managed) {
        const model = { provider: accepted.profile.provider, model: accepted.profile.model, embeddingProfile: accepted.profile };
        await prepareExecutionPolicy(owner, { version: 1, id: accepted.id, parentReceiptId: accepted.id,
            fundingSource: accepted.fundingSource, provider: model.provider, model: model.model,
            aiModels: { summary: model, transliteration: model, embedding: model }, transcriptEnvelope: defaultTranscriptEnvelope(recording.duration || 60),
            promptVersion: AI_PROMPT_VERSION, plannerVersion: 2, maximumAttempts: 2, acceptedAt: accepted.createdAt,
            transcriptRevision: revision, recordingId }, db);
    }
    const previousGeneration = recording.searchIndex?.generation;
    const index = { generation: accepted.id, transcriptRevision: revision, profileId, state: 'indexing' as const,
        totalPassages: accepted.passages.length,
        completedPassages: Object.values(accepted.checkpoints).filter(checkpoint => checkpoint.state === 'completed').length };
    const persist = async (checkpoint: AiCallCheckpoint) => {
        accepted.checkpoints[checkpoint.request.id] = structuredClone(checkpoint);
        await save({ searchIndexWork: accepted });
    };
    const settle = async (checkpoint: AiCallCheckpoint, state: 'completed' | 'unknown') => {
        if (managed) await recordExecutionOutcome(owner, accepted.id, checkpoint.reservationId, state, db);
    };
    await save({ searchIndex: index });
    try {
        await preparePassageRows(owner, recordingId, accepted.id, revision, accepted.profile, accepted.passages.map(item => item.passage), db);
        for (const { passage, call } of accepted.passages) {
            const ref = passageId(owner, recordingId, accepted.id, passage.ordinal);
            let checkpoint = accepted.checkpoints[call.id];
            if (checkpoint && fingerprint(checkpoint.request) !== fingerprint(call)) throw review('The indexing request changed. Review its saved checkpoint.');
            // Completed checkpoints already committed the external response.
            // Publication checks the complete generation again, so continuation
            // need not replay thousands of reads and journal writes before it
            // can reach the first unfinished passage.
            if (checkpoint?.state === 'completed' && checkpoint.resultRef === ref) continue;
            await assertOwned();
            const response = checkpoint ? await savedPassageResponse(ref, owner, call, checkpoint) : null;
            if (response) {
                validateEmbedding(response.vector!, accepted.profile);
                checkpoint = { ...checkpoint!, resultRef: ref, usage: response.response?.usage, state: 'response_saved' };
                await persist(checkpoint);
                await settle(checkpoint, 'completed');
                checkpoint.state = 'completed'; await persist(checkpoint);
            } else {
                if (checkpoint?.resultRef || checkpoint && ['started', 'unknown', 'response_saved', 'completed'].includes(checkpoint.state)) {
                    throw review('An indexing response could not be confirmed. Review the provider outcome before retrying.');
                }
                if (checkpoint?.state !== 'prepared' && (checkpoint?.attempts || 0) >= AI_LIMITS.attempts) throw blocked('This passage used its normal indexing attempt and single retry. Contact the administrator.');
                // Yield only between committed calls. The dispatcher continues
                // this already-approved job without resubmitting saved requests.
                if (providerCalls >= 20 || Date.now() >= deadline) return 'continue';
                await assertSearchIndexingAccess(owner, db);
                const attempt = checkpoint?.state === 'prepared' ? checkpoint.attempts : (checkpoint?.attempts || 0) + 1;
                checkpoint = { request: call, attempts: attempt, state: 'prepared', reservationId: `${accepted.id}:${call.id}:${attempt}` };
                await persist(checkpoint);
                if (managed) await acceptExecutionCall(owner, accepted.id, checkpoint.reservationId, fingerprint(call), db);
                await assertOwned();
                checkpoint.state = 'started'; await persist(checkpoint);
                let usage: AiUsage | undefined, responseKnown = false, responseSaved = false;
                try {
                    const context: AiStepContext = { recordingId, authSubject: owner, throwOnError: true, fundingSource: accepted.fundingSource,
                        reservationId: checkpoint.reservationId, plannedRequest: call,
                        onUsage: async observed => { usage = observed; responseKnown = true; } };
                    await claimPassageAttempt(ref, owner, call, checkpoint);
                    providerCalls++;
                    const vector = await service.generateEmbedding(call.prompt, context);
                    responseKnown = true;
                    validateEmbedding(vector, accepted.profile);
                    await savePassageResponse(ref, owner, call, checkpoint, vector, usage);
                    responseSaved = true;
                    checkpoint = { ...checkpoint, resultRef: ref, usage, state: 'response_saved' };
                    await persist(checkpoint);
                    await settle(checkpoint, 'completed');
                    checkpoint.state = 'completed'; await persist(checkpoint);
                } catch (error) {
                    // A committed external response is recovered before any future provider call.
                    if (responseSaved) throw new ProcessingError('The embedding response is saved. Resume indexing to finish its checkpoint.', {
                        stage: 'embedding', state: 'blocked', code: 'search_checkpoint_pending', retryAction: 'resume_enrichment', providerOutcome: 'responded',
                    });
                    const classification = classifyExternalServiceError(error);
                    const rejected = Boolean(classification.httpStatus && classification.httpStatus >= 400 && classification.httpStatus < 500);
                    const known = responseKnown || rejected;
                    checkpoint = { ...checkpoint, state: known ? 'failed' : 'unknown', usage,
                        error: error instanceof Error ? error.message : 'Search indexing failed.' };
                    await persist(checkpoint); await settle(checkpoint, known ? 'completed' : 'unknown');
                    throw new ProcessingError(known ? 'Search indexing failed. Retry to resume saved progress.' : 'The embedding provider outcome is uncertain. Contact the administrator before retrying.',
                        { ...processingFailure(error, 'embedding', known ? 'responded' : 'unknown'), retryAction: known ? 'resume_enrichment' : 'contact_admin' });
                }
            }
            index.completedPassages = passage.ordinal + 1;
            await save({ searchIndex: { ...index } });
        }
        await assertOwned();
        await publishPassageGeneration(owner, recordingId, accepted.id, index.totalPassages);
        if (managed) await closeExecutionPolicy(owner, accepted.id, db);
        await save({ searchIndex: { ...index, state: 'ready' } });
        if (previousGeneration && previousGeneration !== accepted.id) await removePassageGeneration(owner, recordingId, previousGeneration, db);
    } catch (error) {
        await save({ searchIndex: { ...index, state: 'failed' } }).catch(() => undefined);
        throw error;
    }
}

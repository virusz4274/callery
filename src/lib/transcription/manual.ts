
import { z } from 'zod';
import { claimRecordingForTranscription, getRecordingById } from '@/lib/db/recordings';
import { getTranscriptionAudioUrl } from '@/services/transcription/audio-url';
import { completeTranscriptionResult, continueSavedTranscription } from './completion';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { defaultTranscriptionModel } from './model';
import { updateTranscriptionAttempt } from './execution';
import { classifyExternalServiceError } from '@/lib/external-service-incident-classification';
import { SonioxService } from '@/services/transcription/soniox-service';
import { ElevenLabsService } from '@/services/transcription/elevenlabs-service';
import { TranscriptionFactory, type TranscriptionProviderId } from '@/services/transcription/factory';
import { checkUserAccess, checkTranscriptionAccess } from '@/lib/access-control';
import { resolveTranscriptionProvider } from '@/services/transcription';
import { calculateBilledDuration, isKnownAudioDuration } from '@/lib/utils/billing';
import { billingEnabled } from '@/lib/config';
import { findUserByAuthSubject } from '@/lib/db/users';
import { logger } from '@/lib/logger';
import { captureTranscriptionBilling } from '@/lib/stripe/usage';
import { createTranscriptionReceipt, rememberProviderReference, rememberProviderUsage, releaseTranscriptionReservation } from '@/lib/stripe/transcription-receipt';
import { managedProvider, assertManagedTranscriptionLimits } from '@/lib/stripe/catalog';
import { notifyProcessingOutcome } from './notifications';
import { buildTranscriptionFileSizeError, isTranscriptionFileSizeAllowed } from '@/lib/transcription-limits';
import { RecordingIdSchema } from '@/lib/schemas';
import { getProviderMultiplier } from '@/app/actions/transcription-providers';
import { logSystemEvent } from '@/lib/db/system-log';
import { toFailureDetails } from '@/services/transcription/failure-events';
import { ProcessingError, processingFailure } from './processing-errors';
import { assertProcessingAvailable } from '@/lib/processing-availability';
import { getTeamSettings } from '@/lib/team-policy';


const ManualTranscriptionOptionsSchema = z.object({
    provider: z.enum(['soniox', 'elevenlabs', 'gemini', 'openai_compat']).optional(),
    model: z.string().trim().min(1).max(120).optional(),
    acknowledgeProviderOutcome: z.boolean().optional(),
});

export type ManualTranscriptionOptions = z.infer<typeof ManualTranscriptionOptionsSchema>;

export interface TranscriptionExecution { jobId: string; attemptId: string }
export interface TranscriptionRequestResult {
    success?: boolean; error?: string; jobId?: string; recordingId?: string; state?: 'queued';
    processingStatus?: import('./processing-errors').ProcessingStatus; providerOutcomeUncertain?: boolean; requiresReview?: boolean;
}

async function runManualTranscriptionJob({
    recordingId,
    authSubject,
    r2Key,
    duration,
    providerId,
    model,
    multiplier,
    execution,
}: {
    recordingId: string;
    authSubject: string;
    r2Key: string;
    duration: number;
    providerId: TranscriptionProviderId;
    model?: string;
    multiplier: number;
    execution: TranscriptionExecution;
}) {
    const saved = await getRecordingById(recordingId, authSubject);
    if (saved?.transcriptionEnrichmentPending && saved.fullTranscript) {
        const completion = await continueSavedTranscription(authSubject, recordingId, execution);
        if (completion.outcome === 'partial') throw new ProcessingError(completion.error, completion.processingStatus);
        return;
    }
    await assertProcessingAvailable();
    let fileUrl: string;
    try { fileUrl = await getTranscriptionAudioUrl(providerId, r2Key); }
    catch (error) { throw new ProcessingError(error instanceof Error ? error.message : 'The recording audio URL is unavailable.',
        { stage: 'transcription', state: 'blocked', code: 'recording_audio_unavailable', retryAction: 'retry_transcription', providerOutcome: 'not_started' }); }
    const transcriptionService = TranscriptionFactory.getService(providerId);

    if (providerId === 'elevenlabs' && duration > 300 && transcriptionService instanceof ElevenLabsService) {
        const asyncResult = await transcriptionService.transcribeAsync(fileUrl, {
            durationSeconds: duration,
            billingReceiptId: saved?.transcriptionReceipt?.id,
            processingEnvelope: saved?.transcriptionReceipt?.executionPolicy?.transcriptEnvelope || saved?.transcriptionReceipt?.processingBudget?.transcriptEnvelope,
            onUsage: usage => saved?.transcriptionReceipt ? rememberProviderUsage(saved.transcriptionReceipt, usage) : Promise.resolve(),
            model,
            webhookMetadata: { recordingId, authSubject, ...execution },
        });

        await saveAsyncSubmission(authSubject, recordingId, execution, asyncResult.transcriptionId || asyncResult.requestId);
        return;
    }

    if (providerId === 'soniox' && duration > 300 && transcriptionService instanceof SonioxService) {
        const asyncResult = await transcriptionService.transcribeAsync(fileUrl, {
            durationSeconds: duration,
            billingReceiptId: saved?.transcriptionReceipt?.id,
            processingEnvelope: saved?.transcriptionReceipt?.executionPolicy?.transcriptEnvelope || saved?.transcriptionReceipt?.processingBudget?.transcriptEnvelope,
            onUsage: usage => saved?.transcriptionReceipt ? rememberProviderUsage(saved.transcriptionReceipt, usage) : Promise.resolve(),
            model,
            webhookMetadata: { recordingId, authSubject, ...execution },
        });

        await saveAsyncSubmission(authSubject, recordingId, execution, asyncResult.transcriptionId || asyncResult.requestId);
        return;
    }

    const result = await transcriptionService.transcribe(fileUrl, {
        durationSeconds: duration,
        billingReceiptId: saved?.transcriptionReceipt?.id,
        processingEnvelope: saved?.transcriptionReceipt?.executionPolicy?.transcriptEnvelope || saved?.transcriptionReceipt?.processingBudget?.transcriptEnvelope,
        onUsage: usage => saved?.transcriptionReceipt ? rememberProviderUsage(saved.transcriptionReceipt, usage) : Promise.resolve(),
        model,
    });

    if (saved?.transcriptionReceipt) {
        await rememberProviderReference(saved.transcriptionReceipt, result.transcriptionId);
        await rememberProviderUsage(saved.transcriptionReceipt, result.usage);
    }
    const completion = await completeTranscriptionResult(authSubject, recordingId, {
        segments: result.segments, languageCode: result.languageCode, provider: providerId, model: result.model,
        providerResultId: result.transcriptionId, multiplier,
    }, execution);
    if (completion.outcome === 'partial') throw new ProcessingError(completion.error, completion.processingStatus);

    try {
        await transcriptionService.deleteTranscript(result.transcriptionId);
    } catch (deleteError) {
        logger.error('Failed to delete transcript from provider:', deleteError);
    }
}

/** Read-only request checks. Execution repeats them after queueing. */
export async function validateTranscriptionRequest(uid: string, recordingId: string, options?: ManualTranscriptionOptions) {
    const parseResult = RecordingIdSchema.safeParse(recordingId);
    if (!parseResult.success) {
        throw new Error('Invalid recording ID');
    }
    const validatedRecordingId = parseResult.data;

    const optionsResult = ManualTranscriptionOptionsSchema.safeParse(options || {});
    if (!optionsResult.success) {
        throw new Error('Invalid transcription options');
    }

    const team = await getTeamSettings();
    const companyModel = team.transcriptionModel || defaultTranscriptionModel(team.transcriptionProvider);
    if (team.enabled && team.transcriptionMode === 'off') throw new Error('Transcription is disabled by your company administrator.');
    if (team.enabled && ((optionsResult.data.provider && optionsResult.data.provider !== team.transcriptionProvider) ||
        (optionsResult.data.model && optionsResult.data.model !== companyModel))) {
        throw new Error('Transcription settings are managed by your company administrator.');
    }
    let model = team.enabled ? companyModel : optionsResult.data.model;

    if (!uid) {
        throw new Error('Unauthorized');
    }

    const user = await findUserByAuthSubject(uid);
    if (!user) {
        throw new Error('User not found');
    }

    const recording = await getRecordingById(validatedRecordingId, uid);
    if (!recording) throw new Error('Recording not found');
    const providerId = recording.transcriptionEnrichmentPending
        ? recording.transcriptionProvider || resolveTranscriptionProvider(user)
        : team.enabled ? team.transcriptionProvider : optionsResult.data.provider || resolveTranscriptionProvider(user);
    if (billingEnabled() && !recording.transcriptionEnrichmentPending) model = managedProvider(providerId, model || defaultTranscriptionModel(providerId)).model;

    const access = checkUserAccess(user);
    if (!access.allowed) {
        throw new Error(access.reason || 'Account access is unavailable.');
    }

    if (!recording.transcriptionEnrichmentPending && !TranscriptionFactory.isProviderAvailable(providerId)) {
        throw new Error('Selected transcription provider is not configured');
    }

    if (recording.transcriptionStatus === 'processing') {
        throw new Error('This recording is already being transcribed');
    }

    if (!isTranscriptionFileSizeAllowed(recording.fileSize)) {
        throw new Error(buildTranscriptionFileSizeError(recording.fileSize));
    }
    if (billingEnabled() && !recording.transcriptionEnrichmentPending && !isKnownAudioDuration(recording.duration)) {
        throw new Error('The recording duration could not be verified. Re-upload a supported audio file before starting managed transcription.');
    }

    if (billingEnabled() && !recording.transcriptionEnrichmentPending) assertManagedTranscriptionLimits(providerId, model, recording.duration, recording.fileSize);
    const multiplier = recording.transcriptionEnrichmentPending ? recording.transcriptionCostMultiplier || 1
        : billingEnabled() ? managedProvider(providerId, model).multiplier : await getProviderMultiplier(providerId);
    const costDuration = Math.ceil(calculateBilledDuration(recording.duration) * multiplier);
    const transcriptionAccess = checkTranscriptionAccess(user, recording.transcriptionEnrichmentPending ? 0 : costDuration);
    if (!transcriptionAccess.allowed) throw new Error(transcriptionAccess.reason || 'Transcription limit exceeded');

    return { user, recording, recordingId: validatedRecordingId, providerId, model, multiplier, options: optionsResult.data };
}

function requestFailure(error: unknown, providerExecutionMayHaveStarted = false) {
    const classified = classifyExternalServiceError(error);
    const processingStatus = processingFailure(error, 'transcription', !providerExecutionMayHaveStarted ? 'not_started'
        : ['network', 'timeout', 'upstream_5xx', 'unknown'].includes(classified.errorKind) ? 'unknown' : 'responded');
    return { error: error instanceof Error ? error.message : 'Internal Server Error', processingStatus,
        providerOutcomeUncertain: processingStatus.providerOutcome === 'unknown',
        ...((typeof error === 'object' && error && 'code' in error && error.code === 'transcription_review_required') ? { requiresReview: true } : {}) };
}

/** Public compatibility entry point: enqueue work, never execute a provider call. */
export async function startManualTranscription(uid: string, recordingId: string, options?: ManualTranscriptionOptions): Promise<TranscriptionRequestResult> {
    try {
        if (!uid) throw new Error('Unauthorized');
        const parsedId = RecordingIdSchema.safeParse(recordingId);
        const parsedOptions = ManualTranscriptionOptionsSchema.safeParse(options || {});
        if (!parsedId.success) throw new Error('Invalid recording ID');
        if (!parsedOptions.success) throw new Error('Invalid transcription options');
        const recording = await getRecordingById(parsedId.data, uid);
        if (!recording) throw new Error('Recording not found');
        const { requestTranscription } = await import('@/lib/integrations/jobs');
        return { success: true, ...await requestTranscription(uid, recording, parsedOptions.data, true) };
    } catch (error) { return requestFailure(error); }
}

/** The dispatcher supplies the owned attempt; callers cannot bypass queue admission. */
export async function executeTranscription(uid: string, recordingId: string, options: ManualTranscriptionOptions | undefined, execution: TranscriptionExecution): Promise<TranscriptionRequestResult> {
    let providerExecutionMayHaveStarted = false;
    try {
        const { user, recording, recordingId: validatedRecordingId, providerId, model, multiplier } = await validateTranscriptionRequest(uid, recordingId, options);
        const { isTranscriptionExecutionAuthorized } = await import('@/lib/integrations/jobs');
        if (!await isTranscriptionExecutionAuthorized(uid, recording, execution)) throw new Error('Transcription execution is no longer authorized');
        const db = await getMongoDb();
        // Remove old callback correlation before a new submission; saved enrichment keeps its provider result.
        if (!recording.transcriptionEnrichmentPending) await db.collection(Collections.RECORDINGS).updateOne(
            { _id: new ObjectId(validatedRecordingId), authSubject: uid }, { $unset: { externalTranscriptionId: '', transcriptionResultAttemptId: '', transcriptionBillingContext: '' } },
        );
        const receipt = billingEnabled() && !recording.transcriptionEnrichmentPending
            ? await createTranscriptionReceipt(user, validatedRecordingId, execution.attemptId, providerId, model, recording.duration, recording.fileSize) : undefined;
        const claimed = await claimRecordingForTranscription(validatedRecordingId, uid, {
            transcriptionProvider: providerId,
            transcriptionModel: model,
            transcriptionCostMultiplier: recording.transcriptionEnrichmentPending ? recording.transcriptionCostMultiplier : multiplier,
            transcriptionJobId: execution.jobId,
            transcriptionAttemptId: execution.attemptId,
            transcriptionError: '',
            processingStatus: { stage: recording.transcriptionEnrichmentPending ? recording.processingStatus?.stage || 'summary' : 'transcription',
                state: 'running', providerOutcome: 'not_started' },
            ...(!recording.transcriptionEnrichmentPending ? { transcriptionBillingContext: captureTranscriptionBilling(user) ?? null } : {}),
            ...(receipt ? { transcriptionReceipt: receipt } : {}),
        });
        if (!claimed) {
            if (receipt) await releaseTranscriptionReservation(uid, receipt);
            return { error: 'This recording is already being transcribed' };
        }
        logger.info(`[Action/Transcribe] Starting ${providerId} background job for ${validatedRecordingId}`);

        const execute = async () => {
            try {
                await runManualTranscriptionJob({
                    recordingId: validatedRecordingId,
                    authSubject: uid,
                    r2Key: recording.r2Key,
                    duration: recording.duration,
                    providerId,
                    model,
                    multiplier,
                    execution,
                });
                logger.info(`[Action/Transcribe] Job completed for ${validatedRecordingId}`);
            } catch (error) {
                const outcome = classifyExternalServiceError(error);
                const latest = await getRecordingById(validatedRecordingId, uid);
                const phase = latest?.transcriptionEnrichmentPending ? latest.processingStatus?.stage || 'summary' : 'transcription';
                const processingStatus = processingFailure(error, phase,
                    ['auth', 'quota', 'rate_limit', 'validation'].includes(outcome.errorKind) ? 'responded' : 'unknown');
                if (receipt && (processingStatus.providerOutcome === 'not_started' || ['auth', 'quota', 'rate_limit', 'validation'].includes(outcome.errorKind))
                    && !await getRecordingById(validatedRecordingId, uid).then(row => row?.transcriptionEnrichmentPending)) {
                    await releaseTranscriptionReservation(uid, receipt);
                }
                logger.error('[Action/Transcribe] Background job failed:', error);
                await logSystemEvent('TRANSCRIPTION_FAILED', toFailureDetails(error, {
                    provider: providerId, recordingId: validatedRecordingId, authSubject: uid, durationSeconds: recording.duration,
                }), validatedRecordingId);
                await updateTranscriptionAttempt(uid, validatedRecordingId, execution, {
                    transcriptionStatus: 'failed',
                    transcriptionError: latest?.transcriptionEnrichmentPending ? 'Transcript saved. AI enrichment needs attention.' : 'Processing failed. Review the provider outcome before retrying.',
                    processingStatus,
                });

                await notifyProcessingOutcome(uid, validatedRecordingId, latest?.transcriptionEnrichmentPending ? 'partial' : 'failed', execution.attemptId);
                throw new ProcessingError(error instanceof Error ? error.message : 'Processing failed', processingStatus);
            }
        };
        // Admission and configuration failures cannot have submitted provider work.
        // After execution starts, preserve conservative handling of unknown outcomes.
        providerExecutionMayHaveStarted = true;
        await execute();

        return { success: true };
    } catch (error) {
        logger.error('Transcription execution error:', error);
        return requestFailure(error, providerExecutionMayHaveStarted);
    }
}

async function saveAsyncSubmission(owner: string, recordingId: string, execution: TranscriptionExecution, providerId: string | undefined) {
    if (!providerId) throw new Error('Provider submission returned no identifier. Review before retrying.');
    const db = await getMongoDb();
    const saved = await getRecordingById(recordingId, owner);
    if (saved?.transcriptionReceipt) await rememberProviderReference(saved.transcriptionReceipt, providerId, db);
    // An authenticated early callback may have initialized correlation already.
    await db.collection(Collections.RECORDINGS).updateOne({
        _id: new ObjectId(recordingId), authSubject: owner, transcriptionAttemptId: execution.attemptId,
        externalTranscriptionId: { $exists: false },
    }, { $set: { externalTranscriptionId: providerId } });
}

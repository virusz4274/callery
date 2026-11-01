import { getRecordingById, markTranscriptionUsageReported } from '@/lib/db/recordings';
import { incrementTranscriptionUsed } from '@/lib/db/users';
import type { Recording, TranscriptionSegment, UpdateRecordingInput } from '@/lib/db/types';
import { billingEnabled } from '@/lib/config';
import { calculateBilledDuration } from '@/lib/utils/billing';
import { drainLedgerOutbox, reportUsage } from '@/lib/stripe/usage';
import { settleCanonicalTranscription } from '@/lib/stripe/transcription-receipt';
import { assertTranscriptEnvelope } from './ai-work-plan';
import { updateDeferredTranscriptionResult, updateLegacyTranscriptionResult, updateTranscriptionAttempt } from './execution';
import { finishTranscriptionEnrichment } from './enrichment';
import type { TranscriptionExecution } from './manual';
import { processingFailure, type ProcessingStatus } from './processing-errors';
import { notifyProcessingOutcome } from './notifications';

export interface AcceptedTranscriptResult {
    segments: TranscriptionSegment[];
    languageCode: string;
    provider: NonNullable<Recording['transcriptionProvider']>;
    providerResultId?: string;
    model?: string;
    multiplier: number;
}
export type TranscriptionCompletion = { outcome: 'completed'; transcriptAvailable: true }
    | { outcome: 'partial'; transcriptAvailable: true; error: string; processingStatus: ProcessingStatus };

async function settleSavedAudioUsage(authSubject: string, recordingId: string, providerId: string, duration: number, multiplier: number,
    externalId: string | undefined, saved: Recording, acceptedResult = false) {
    if (!acceptedResult && billingEnabled() && saved.transcriptionEnrichmentPending && saved.fullTranscript) {
        const receipt = saved.transcriptionReceipt;
        const retailOnly = receipt?.accountingMode === 'retail_only' || Boolean(receipt?.executionPolicy);
        const deliveredThisReceipt = Boolean(receipt && (receipt.queuedAt || saved.transcriptionUsageReportId === receipt.id));
        // A newly requested transcription can retain older recording-level
        // delivery marks. Those marks never acknowledge its new retail receipt.
        if (deliveredThisReceipt) return;
        if (!retailOnly && (saved.transcriptionUsageReportedAt || saved.transcriptionUsageReportId)) return;
        // Historical saved content without an accepted financial reservation
        // can resume AI without inventing a past audio charge.
        if (!retailOnly && !receipt?.reservationId && !receipt?.operatorReservationId) return;
    }
    if (saved?.transcriptionReceipt) {
        await settleCanonicalTranscription(authSubject, saved.transcriptionReceipt);
        await drainLedgerOutbox(authSubject);
        await incrementTranscriptionUsed(authSubject, saved.transcriptionReceipt.consumedSeconds, saved.transcriptionReceipt.id, undefined, saved.transcriptionReceipt.acceptedAt);
        await markTranscriptionUsageReported(recordingId, authSubject, saved.transcriptionReceipt.id);
        return;
    }
    if (saved?.transcriptionLegacyBilling) {
        if (saved.transcriptionLegacyBilling.state === 'review') throw new Error('The historical transcription payment needs reconciliation before another billing attempt.');
        return;
    }
    const usageReportId = `${providerId}:${externalId}`;
    if (saved?.transcriptionUsageReportId === usageReportId) return;
    const identifier = `transcription:${authSubject}:recording:${recordingId}:${providerId}:${externalId}`;
    // Persist the meter event before recording the local completion receipt.
    // Replays use the same event ID and atomic per-account counter receipt.
    await reportUsage(authSubject, 'transcription', calculateBilledDuration(duration), {
        multiplier, identifier, acceptedBilling: saved?.transcriptionBillingContext,
    });
    if (saved?.transcriptionUsageReportId !== usageReportId) {
        await incrementTranscriptionUsed(authSubject, Math.ceil(calculateBilledDuration(duration) * multiplier), identifier, undefined, saved?.transcriptionBillingContext?.acceptedAt);
        await markTranscriptionUsageReported(recordingId, authSubject, usageReportId);
    }
}


async function saveResult(owner: string, recordingId: string, previous: Recording, patch: UpdateRecordingInput, execution?: TranscriptionExecution) {
    if (execution) await updateTranscriptionAttempt(owner, recordingId, execution, patch);
    else await updateLegacyTranscriptionResult(owner, recordingId, previous, patch);
}

/** Save and settle an authoritative result independently of paid AI execution. */
export async function acceptTranscriptionResult(owner: string, recordingId: string, result: AcceptedTranscriptResult,
    execution?: TranscriptionExecution, deferEnrichment = false): Promise<{ recording: Recording; newlyAccepted: boolean }> {
    const recording = await getRecordingById(recordingId, owner);
    if (!recording) throw new Error('Recording unavailable before transcript acceptance.');
    const resultAttempt = execution?.attemptId || `provider:${result.providerResultId || recording.externalTranscriptionId}`;
    if (recording.transcriptionResultAttemptId !== resultAttempt) {
        const envelope = recording.transcriptionReceipt?.executionPolicy?.transcriptEnvelope || recording.transcriptionReceipt?.processingBudget?.transcriptEnvelope;
        if (envelope) assertTranscriptEnvelope(result.segments, envelope);
        const patch: UpdateRecordingInput = {
            fullTranscript: result.segments, languageCode: result.languageCode,
            transcriptionStatus: deferEnrichment ? 'pending' : 'processing', aiWorkPlan: null, aiWorkCheckpoints: {}, summary: '', summaryEmbedding: [],
            transcriptionEnrichmentPending: true, transcriptionEnrichmentSteps: {}, transcriptionResultAttemptId: resultAttempt,
            processingStatus: deferEnrichment ? { stage: 'summary', state: 'blocked', code: 'enrichment_queued', retryAction: 'none', providerOutcome: 'not_started' }
                : { stage: 'summary', state: 'running', providerOutcome: 'not_started' },
            transcriptionProvider: result.provider, transcriptionModel: result.model,
            transcriptionCostMultiplier: result.multiplier,
            ...(result.providerResultId ? { externalTranscriptionId: result.providerResultId } : {}),
            ...(recording.transcriptionReceipt ? { transcriptionReceipt: { ...recording.transcriptionReceipt, readyAt: new Date() } } : {}),
            ...(deferEnrichment && execution ? { transcriptionCompletionPending: execution } : {}),
        };
        if (deferEnrichment && execution) await updateDeferredTranscriptionResult(owner, recordingId, recording, execution, patch);
        else await saveResult(owner, recordingId, recording, patch, execution);
    }
    const saved = await getRecordingById(recordingId, owner);
    if (!saved) throw new Error('Recording unavailable after transcript acceptance.');
    if (saved.transcriptionResultAttemptId !== resultAttempt
        || saved.transcriptionReceipt?.id !== recording.transcriptionReceipt?.id
        || execution && (saved.transcriptionAttemptId !== execution.attemptId || saved.transcriptionJobId !== execution.jobId)
        || !execution && saved.transcriptionAttemptId) {
        throw new Error('A newer transcription result owns this recording.');
    }
    await settleSavedAudioUsage(owner, recordingId, result.provider, saved.duration, result.multiplier, result.providerResultId, saved, true);
    return { recording: saved, newlyAccepted: recording.transcriptionResultAttemptId !== resultAttempt };
}

/** All transports share completion, while callback redelivery never retries failed AI. */
export async function completeTranscriptionResult(owner: string, recordingId: string, result: AcceptedTranscriptResult,
    execution?: TranscriptionExecution): Promise<TranscriptionCompletion> {
    const accepted = await acceptTranscriptionResult(owner, recordingId, result, execution);
    const saved = accepted.recording;
    if (!accepted.newlyAccepted && saved.transcriptionStatus === 'failed' && saved.transcriptionEnrichmentPending) {
        const processingStatus = saved.processingStatus || processingFailure(new Error('Saved AI processing needs review.'), 'summary', 'unknown');
        await notifyProcessingOutcome(owner, recordingId, 'partial', execution?.attemptId);
        return { outcome: 'partial', transcriptAvailable: true, error: saved.transcriptionError || 'AI enrichment needs attention.', processingStatus };
    }
    return finishSavedResult(owner, recordingId, saved, execution);
}

/** Resume owned saved content without replaying ASR or inventing historical usage. */
export async function continueSavedTranscription(owner: string, recordingId: string, execution?: TranscriptionExecution): Promise<TranscriptionCompletion> {
    const saved = await getRecordingById(recordingId, owner);
    if (!saved?.fullTranscript) throw new Error('The saved transcript is unavailable.');
    await settleSavedAudioUsage(owner, recordingId, saved.transcriptionProvider || 'gemini', saved.duration,
        saved.transcriptionCostMultiplier || 1, saved.externalTranscriptionId, saved);
    return finishSavedResult(owner, recordingId, saved, execution);
}

async function finishSavedResult(owner: string, recordingId: string, saved: Recording, execution?: TranscriptionExecution): Promise<TranscriptionCompletion> {
    if (saved.transcriptionStatus !== 'completed' || saved.transcriptionEnrichmentPending) {
        try { await finishTranscriptionEnrichment(owner, recordingId, execution, saved.transcriptionResultAttemptId); }
        catch (error) {
            const processingStatus = processingFailure(error, saved.processingStatus?.stage === 'transcription' ? 'summary' : saved.processingStatus?.stage || 'summary', 'responded');
            // Preserve the transcript and exact resumable checkpoints. Only the
            // enrichment stage failed; successful audio remains settled once.
            await saveResult(owner, recordingId, saved, { transcriptionStatus: 'failed',
                transcriptionError: 'Transcript saved. AI enrichment needs attention.',
                processingStatus }, execution);
            await notifyProcessingOutcome(owner, recordingId, 'partial', execution?.attemptId);
            return { outcome: 'partial', transcriptAvailable: true,
                error: error instanceof Error ? error.message : 'AI enrichment failed.', processingStatus };
        }
    }
    await notifyProcessingOutcome(owner, recordingId, 'completed', execution?.attemptId);
    return { outcome: 'completed', transcriptAvailable: true };
}

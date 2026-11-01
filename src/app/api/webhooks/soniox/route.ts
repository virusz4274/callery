import { timingSafeEqual } from 'node:crypto';
import { NextResponse, after } from 'next/server';
import { logger } from '@/lib/logger';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { Recording } from '@/lib/db/types';
import { drainLedgerOutbox } from '@/lib/stripe/usage';
import { settleRemovedRecording, settleFailedTranscription } from '@/lib/stripe/transcription-receipt';
import { updateDeferredTranscriptionResult, updateLegacyTranscriptionResult, updateTranscriptionAttempt } from '@/lib/transcription/execution';
import { acceptTranscriptionResult, completeTranscriptionResult } from '@/lib/transcription/completion';
import { ProcessingError, processingFailure } from '@/lib/transcription/processing-errors';
import { settleQueuedTranscription, processTranscriptionJobs, beginQueuedWebhookExecution, queueDeferredTranscriptionCompletion } from '@/lib/integrations/jobs';
import { notifyProcessingOutcome } from '@/lib/transcription/notifications';
import { ObjectId } from 'mongodb';
import {
    claimTranscriptionWebhookEvent,
    markTranscriptionWebhookFailed,
    markTranscriptionWebhookProcessed,
} from '@/lib/webhooks/transcription-events';
import { processSonioxWordsIntoSegments, type SonioxWebhookPayload } from './helpers';
import { env } from '@/lib/env';
import { defaultTranscriptEnvelope } from '@/lib/transcription/ai-work-plan';
import { readBoundedTranscriptionText, TranscriptionResponseTooLargeError } from '@/services/transcription/response';

/**
 * Soniox Webhook - Receives async transcription notifications
 *
 * NOTE: Unlike ElevenLabs, Soniox webhooks only notify of completion.
 * They do NOT include transcript data. We must fetch it using the ID.
 */



export const runtime = 'nodejs';

function timingSafeHeaderEquals(received: string | null, expected: string): boolean {
    if (!received) {
        return false;
    }

    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);

    if (expectedBuffer.length !== receivedBuffer.length) {
        return false;
    }

    return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function POST(request: Request) {
    let claimedEventId: string | null = null;
    let stopLease: (() => void) | undefined;

    try {
        // Extract metadata from query params
        const url = new URL(request.url);
        const recordingId = url.searchParams.get('recordingId');
        const authSubject = url.searchParams.get('authSubject');
        const jobId = url.searchParams.get('jobId');
        const attemptId = url.searchParams.get('attemptId');

        // Verify webhook secret
        const expectedSecret = env.SONIOX_WEBHOOK_SECRET;
        if (!expectedSecret) {
            logger.error('[Soniox Webhook] SONIOX_WEBHOOK_SECRET is not configured');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const receivedSecret = request.headers.get('X-Soniox-Secret');
        if (!timingSafeHeaderEquals(receivedSecret, expectedSecret)) {
            logger.warn('[Soniox Webhook] Invalid secret received');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const rawBody = await request.text();
        let payload: SonioxWebhookPayload;
        try {
            payload = JSON.parse(rawBody) as SonioxWebhookPayload;
        } catch {
            logger.error('[Soniox Webhook] Invalid JSON payload');
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        logger.info(`[Soniox Webhook] Received for transcription_id: ${payload.id}, status: ${payload.status}`);

        if (!recordingId || !authSubject) {
            logger.error('[Soniox Webhook] Missing metadata (recordingId or authSubject)');
            return NextResponse.json({ success: true, status: 'ignored_missing_metadata' });
        }

        if (!ObjectId.isValid(recordingId)) {
            logger.error(`[Soniox Webhook] Invalid recordingId: ${recordingId}`);
            return NextResponse.json({ success: true, status: 'ignored_invalid_recording_id' });
        }

        if (!payload?.id || !payload?.status) {
            logger.error('[Soniox Webhook] Missing required payload fields (id/status)');
            return NextResponse.json({ error: 'Missing payload fields' }, { status: 400 });
        }

        // Verify the recording exists
        const db = await getMongoDb();
        const recording = await db.collection<Recording>(Collections.RECORDINGS).findOne({
            _id: new ObjectId(recordingId),
            authSubject,
        });

        if (!recording) {
            if (['completed', 'error'].includes(payload.status) && await settleRemovedRecording(authSubject, recordingId, 'soniox', [payload.id], attemptId || undefined, payload.status === 'completed', db)) {
                await drainLedgerOutbox(authSubject, db);
                return NextResponse.json({ success: true, status: 'financial_receipt_retained' });
            }
            logger.error(`[Soniox Webhook] Recording not found: ${recordingId}`);
            return NextResponse.json({ success: true, status: 'ignored_recording_not_found' });
        }

        if (recording.transcriptionAttemptId && (attemptId !== recording.transcriptionAttemptId || jobId !== recording.transcriptionJobId)) {
            return NextResponse.json({ success: true, status: 'ignored_stale_attempt' });
        }

        // The signed callback may beat the submission response. Its current
        // attempt identity can initialize correlation without waiting for redelivery.
        if (!recording.externalTranscriptionId && recording.transcriptionAttemptId && attemptId === recording.transcriptionAttemptId && jobId === recording.transcriptionJobId && payload.id) {
            const initialized = await db.collection<Recording>(Collections.RECORDINGS).findOneAndUpdate({
                _id: recording._id, authSubject, transcriptionAttemptId: attemptId,
                externalTranscriptionId: { $exists: false },
            }, { $set: { externalTranscriptionId: payload.id } }, { returnDocument: 'after' });
            const correlated = initialized || await db.collection<Recording>(Collections.RECORDINGS).findOne({ _id: recording._id, authSubject });
            recording.externalTranscriptionId = correlated?.externalTranscriptionId;
        }

        if (!recording.externalTranscriptionId) {
            logger.warn(
                `[Soniox Webhook] Missing externalTranscriptionId on recording ${recordingId}. Rejecting callback for safety.`
            );
            return NextResponse.json({ error: 'Correlation not initialized' }, { status: 409 });
        }

        if (recording.externalTranscriptionId !== payload.id) {
            logger.error(
                `[Soniox Webhook] Correlation mismatch for ${recordingId}. Expected ${recording.externalTranscriptionId}, got ${payload.id}`
            );
            return NextResponse.json(
                { success: false, status: 'correlation_mismatch' },
                { status: 409 }
            );
        }

        const eventId = `soniox:${recordingId}:${recording.externalTranscriptionId}:${payload.status}`;
        const claimStatus = await claimTranscriptionWebhookEvent({
            eventId,
            provider: 'soniox',
            recordingId,
            externalTranscriptionId: recording.externalTranscriptionId,
            deliveryStatus: payload.status,
        });

        if (claimStatus === 'already_processed') {
            return NextResponse.json({ success: true, status: 'already_processed' });
        }

        if (claimStatus === 'in_progress') {
            return NextResponse.json({ success: true, status: 'processing' });
        }

        claimedEventId = eventId;
        const execution = jobId && attemptId ? { jobId, attemptId } : undefined;
        const resultAttempt = execution?.attemptId || `provider:${recording.externalTranscriptionId}`;
        const alreadyEnriched = recording.transcriptionResultAttemptId === resultAttempt && recording.transcriptionStatus === 'completed' && !recording.transcriptionEnrichmentPending;
        if (!alreadyEnriched) stopLease = await beginQueuedWebhookExecution(authSubject, recordingId, eventId, execution);
        const save = (patch: import('@/lib/db/types').UpdateRecordingInput) => execution
            ? stopLease ? updateTranscriptionAttempt(authSubject, recordingId, execution, patch)
                : updateDeferredTranscriptionResult(authSubject, recordingId, recording, execution, patch)
            : updateLegacyTranscriptionResult(authSubject, recordingId, recording, patch);

        // Handle error status
        if (payload.status === 'error') {
            if (recording.transcriptionResultAttemptId === resultAttempt && recording.fullTranscript) {
                await markTranscriptionWebhookProcessed(eventId);
                return NextResponse.json({ success: true, status: 'ignored_obsolete_failure' });
            }
            if (recording.transcriptionReceipt) await settleFailedTranscription(authSubject, recording.transcriptionReceipt, undefined, 'failed');
            logger.error(`[Soniox Webhook] Transcription failed for ${payload.id}`);
            await save({
                transcriptionStatus: 'failed',
                transcriptionError: 'The transcription provider rejected this recording.',
                processingStatus: processingFailure(new Error('The transcription provider rejected this recording.'), 'transcription', 'responded'),
            });
            await markTranscriptionWebhookProcessed(eventId);
            await settleQueuedTranscription(authSubject, recordingId, execution);
            after(async () => { await processTranscriptionJobs(); });
            await notifyProcessingOutcome(authSubject, recordingId, 'failed', attemptId || undefined);
            return NextResponse.json({ success: true, status: 'error_recorded' });
        }

        // Fetch the actual transcript from Soniox
        const sonioxApiKey = env.SONIOX_API_KEY;
        const sonioxBaseUrl = env.SONIOX_API_BASE_URL;

        if (!sonioxApiKey) {
            logger.error('[Soniox Webhook] SONIOX_API_KEY not configured');
            throw new Error('SONIOX_API_KEY not configured');
        }

        logger.info(`[Soniox Webhook] Fetching transcript for ${payload.id}...`);

        const transcriptResponse = await fetch(`${sonioxBaseUrl}/v1/transcriptions/${payload.id}/transcript`, {
            method: 'GET',
            signal: AbortSignal.timeout(60_000),
            headers: {
                'Authorization': `Bearer ${sonioxApiKey}`,
            },
        });

        if (!transcriptResponse.ok) {
            const errText = await readBoundedTranscriptionText(transcriptResponse, 64 * 1024);
            logger.error(`[Soniox Webhook] Failed to fetch transcript: ${transcriptResponse.status} - ${errText}`);
            await save({
                transcriptionStatus: 'failed',
            });
            throw new Error(`Failed to fetch transcript (${transcriptResponse.status})`);
        }

        const responseLimit = (recording.transcriptionReceipt?.executionPolicy?.transcriptEnvelope || recording.transcriptionReceipt?.processingBudget?.transcriptEnvelope || defaultTranscriptEnvelope(recording.duration || 60)).maxResponseBytes;
        let transcriptData;
        try { transcriptData = JSON.parse(await readBoundedTranscriptionText(transcriptResponse, responseLimit)); }
        catch (error) {
            if (!(error instanceof TranscriptionResponseTooLargeError)) throw error;
            const processingStatus = { stage: 'transcription', state: 'needs_review', code: 'transcript_envelope_exceeded', retryAction: 'contact_admin', providerOutcome: 'responded' } as const;
            await save({ transcriptionStatus: 'failed', transcriptionError: error.message, processingStatus });
            await markTranscriptionWebhookProcessed(eventId);
            await settleQueuedTranscription(authSubject, recordingId, execution);
            after(async () => { await processTranscriptionJobs(); });
            return NextResponse.json({ success: true, status: 'needs_review' });
        }

        // Process transcript
        const words = transcriptData.tokens || transcriptData.words || [];
        const segments = processSonioxWordsIntoSegments(words);
        const languageCode = transcriptData.detected_language || 'unknown';
        let completion;
        try {
            const normalizedResult = {
                segments, languageCode, provider: 'soniox', providerResultId: recording.externalTranscriptionId,
                multiplier: recording.transcriptionCostMultiplier || 1, model: recording.transcriptionModel,
            } as const;
            if (execution && !stopLease && !alreadyEnriched) {
                const accepted = await acceptTranscriptionResult(authSubject, recordingId, normalizedResult, execution, true);
                if (accepted.recording.transcriptionCompletionPending) {
                    await queueDeferredTranscriptionCompletion(authSubject, recordingId, execution, db);
                    completion = { outcome: 'queued' as const };
                } else completion = { outcome: accepted.recording.transcriptionStatus === 'completed' ? 'completed' as const : 'partial' as const };
            } else completion = await completeTranscriptionResult(authSubject, recordingId, normalizedResult, execution);
        } catch (error) {
            if (!(error instanceof ProcessingError) || error.processingStatus.code !== 'transcript_envelope_exceeded') throw error;
            await save({ transcriptionStatus: 'failed', transcriptionError: error.message, processingStatus: error.processingStatus });
            await settleQueuedTranscription(authSubject, recordingId, execution);
            await markTranscriptionWebhookProcessed(eventId);
            after(async () => { await processTranscriptionJobs(); });
            return NextResponse.json({ success: true, status: 'needs_review' });
        }
        await markTranscriptionWebhookProcessed(eventId);
        if (completion.outcome !== 'queued') await settleQueuedTranscription(authSubject, recordingId, execution);
        after(async () => { await processTranscriptionJobs(); });
        return NextResponse.json({ success: true, status: completion.outcome === 'partial' ? 'needs_review' : completion.outcome });

    } catch (error) {
        if (claimedEventId) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown webhook error';
            try {
                await markTranscriptionWebhookFailed(claimedEventId, errorMessage);
            } catch (markError) {
                logger.error('[Soniox Webhook] Failed to mark webhook event as failed:', markError);
            }
        }

        logger.error('[Soniox Webhook] Error processing webhook:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        stopLease?.();
    }
}

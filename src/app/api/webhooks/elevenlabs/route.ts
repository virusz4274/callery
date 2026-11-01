import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse, after } from 'next/server';
import { ObjectId } from 'mongodb';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { Recording } from '@/lib/db/types';
import { drainLedgerOutbox } from '@/lib/stripe/usage';
import { settleRemovedRecording, settleFailedTranscription } from '@/lib/stripe/transcription-receipt';
import { updateDeferredTranscriptionResult, updateLegacyTranscriptionResult, updateTranscriptionAttempt } from '@/lib/transcription/execution';
import { acceptTranscriptionResult, completeTranscriptionResult } from '@/lib/transcription/completion';
import { ProcessingError, processingFailure } from '@/lib/transcription/processing-errors';
import { settleQueuedTranscription, processTranscriptionJobs, beginQueuedWebhookExecution, queueDeferredTranscriptionCompletion } from '@/lib/integrations/jobs';
import { notifyProcessingOutcome } from '@/lib/transcription/notifications';
import {
    claimTranscriptionWebhookEvent,
    markTranscriptionWebhookFailed,
    markTranscriptionWebhookProcessed,
} from '@/lib/webhooks/transcription-events';
import { processElevenLabsWordsIntoSegments, type ElevenLabsWebhookPayload } from './helpers';

/**
 * ElevenLabs Webhook - Receives async transcription results
 *
 * This endpoint is called by ElevenLabs when an async transcription completes.
 * The webhook_metadata contains the recordingId and authSubject for correlation.
 */


const MAX_SIGNATURE_AGE_SECONDS = 5 * 60;

export const runtime = 'nodejs';

type ElevenLabsWebhookEnvelope = {
    type?: string;
    event_timestamp?: number;
    data?: ElevenLabsWebhookPayload;
};

function parseElevenLabsMetadata(metadata: unknown): { recordingId?: string; authSubject?: string; jobId?: string; attemptId?: string } {
    if (!metadata) {
        return {};
    }

    if (typeof metadata === 'string') {
        try {
            const parsed = JSON.parse(metadata) as { recordingId?: string; authSubject?: string; jobId?: string; attemptId?: string };
            return parsed ?? {};
        } catch {
            return {};
        }
    }

    if (typeof metadata === 'object') {
        const typed = metadata as { recordingId?: string; authSubject?: string; jobId?: string; attemptId?: string };
        return typed;
    }

    return {};
}

function normalizeElevenLabsPayload(parsed: unknown): ElevenLabsWebhookPayload {
    const envelope = parsed as ElevenLabsWebhookEnvelope;
    const nestedData = envelope?.data;

    if (nestedData && typeof nestedData === 'object') {
        const inferredStatus =
            nestedData.status ||
            (envelope.type?.includes('error') ? 'failed' : envelope.type?.includes('complete') ? 'success' : undefined);

        return {
            ...nestedData,
            status: inferredStatus || nestedData.status,
        } as ElevenLabsWebhookPayload;
    }

    return parsed as ElevenLabsWebhookPayload;
}

function parseSignatureHeader(signatureHeader: string): { timestamp: number; signatures: string[] } | null {
    const parts = signatureHeader.split(',').map((part) => part.trim());
    let timestamp: number | null = null;
    const signatures: string[] = [];

    for (const part of parts) {
        const [key, value] = part.split('=', 2);
        if (!key || !value) {
            continue;
        }

        if (key === 't') {
            const parsedTimestamp = Number.parseInt(value, 10);
            if (!Number.isNaN(parsedTimestamp)) {
                timestamp = parsedTimestamp;
            }
            continue;
        }

        if (key.startsWith('v')) {
            signatures.push(value);
        }
    }

    if (!timestamp || signatures.length === 0) {
        return null;
    }

    return { timestamp, signatures };
}

function verifyElevenLabsSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
    const parsedSignature = parseSignatureHeader(signatureHeader);
    if (!parsedSignature) {
        return false;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - parsedSignature.timestamp) > MAX_SIGNATURE_AGE_SECONDS) {
        return false;
    }

    const signedPayload = `${parsedSignature.timestamp}.${rawBody}`;
    const expectedSignature = createHmac('sha256', secret).update(signedPayload).digest('hex');

    return parsedSignature.signatures.some((receivedSignature) => {
        const expectedBuffer = Buffer.from(expectedSignature);
        const receivedBuffer = Buffer.from(receivedSignature);

        if (expectedBuffer.length !== receivedBuffer.length) {
            return false;
        }

        return timingSafeEqual(expectedBuffer, receivedBuffer);
    });
}

export async function POST(request: Request) {
    let claimedEventId: string | null = null;
    let stopLease: (() => void) | undefined;

    try {
        const webhookSecret = env.ELEVENLABS_WEBHOOK_SECRET;
        if (!webhookSecret) {
            logger.error('[ElevenLabs Webhook] ELEVENLABS_WEBHOOK_SECRET is not configured');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const signatureHeader = request.headers.get('elevenlabs-signature') || request.headers.get('ElevenLabs-Signature');
        if (!signatureHeader) {
            logger.warn('[ElevenLabs Webhook] Missing ElevenLabs-Signature header');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const rawBody = await request.text();
        if (!verifyElevenLabsSignature(rawBody, signatureHeader, webhookSecret)) {
            logger.warn('[ElevenLabs Webhook] Invalid signature');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let parsedBody: unknown;
        try {
            parsedBody = JSON.parse(rawBody);
        } catch {
            logger.warn('[ElevenLabs Webhook] Invalid JSON payload');
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        const payload = normalizeElevenLabsPayload(parsedBody);

        logger.info(`[ElevenLabs Webhook] Received for request_id: ${payload.request_id}`);

        // Validate required metadata
        const { recordingId, authSubject, jobId, attemptId } = parseElevenLabsMetadata(payload.webhook_metadata);

        if (!recordingId || !authSubject) {
            logger.error('[ElevenLabs Webhook] Missing webhook_metadata (recordingId or authSubject)');
            return NextResponse.json(
                { error: 'Missing webhook_metadata' },
                { status: 400 }
            );
        }

        if (!ObjectId.isValid(recordingId)) {
            logger.error(`[ElevenLabs Webhook] Invalid recordingId: ${recordingId}`);
            return NextResponse.json({ error: 'Invalid recording ID' }, { status: 400 });
        }

        const deliveryStatus = payload.status;
        if (!deliveryStatus) {
            logger.error('[ElevenLabs Webhook] Missing status field');
            return NextResponse.json({ error: 'Missing status' }, { status: 400 });
        }

        // Verify the recording exists and belongs to the user
        const db = await getMongoDb();
        const recording = await db.collection<Recording>(Collections.RECORDINGS).findOne({
            _id: new ObjectId(recordingId),
            authSubject,
        });

        if (!recording) {
            if (['success', 'failed'].includes(payload.status || '') && await settleRemovedRecording(authSubject, recordingId, 'elevenlabs', [payload.transcription_id, payload.request_id].filter((id): id is string => Boolean(id)), attemptId, payload.status === 'success', db)) {
                await drainLedgerOutbox(authSubject, db);
                return NextResponse.json({ success: true, status: 'financial_receipt_retained' });
            }
            logger.error(`[ElevenLabs Webhook] Recording not found: ${recordingId}`);
            return NextResponse.json(
                { error: 'Recording not found' },
                { status: 404 }
            );
        }

        const incomingCorrelationIds = [payload.transcription_id, payload.request_id].filter(
            (value): value is string => Boolean(value)
        );

        if (recording.transcriptionAttemptId && (attemptId !== recording.transcriptionAttemptId || jobId !== recording.transcriptionJobId)) {
            return NextResponse.json({ success: true, status: 'ignored_stale_attempt' });
        }

        // The signed callback may beat the submission response. Its current
        // attempt identity can initialize correlation without waiting for redelivery.
        if (!recording.externalTranscriptionId && recording.transcriptionAttemptId && attemptId === recording.transcriptionAttemptId && jobId === recording.transcriptionJobId && incomingCorrelationIds[0]) {
            const initialized = await db.collection<Recording>(Collections.RECORDINGS).findOneAndUpdate({
                _id: recording._id, authSubject, transcriptionAttemptId: attemptId,
                externalTranscriptionId: { $exists: false },
            }, { $set: { externalTranscriptionId: incomingCorrelationIds[0] } }, { returnDocument: 'after' });
            const correlated = initialized || await db.collection<Recording>(Collections.RECORDINGS).findOne({ _id: recording._id, authSubject });
            recording.externalTranscriptionId = correlated?.externalTranscriptionId;
        }

        if (!recording.externalTranscriptionId) {
            logger.warn(
                `[ElevenLabs Webhook] Missing externalTranscriptionId on recording ${recordingId}. Rejecting callback for safety.`
            );
            return NextResponse.json({ error: 'Correlation not initialized' }, { status: 409 });
        }

        if (!incomingCorrelationIds.includes(recording.externalTranscriptionId)) {
            logger.warn(
                `[ElevenLabs Webhook] Correlation mismatch for ${recordingId}. Expected ${recording.externalTranscriptionId}, got ${incomingCorrelationIds.join(',')}`
            );
            return NextResponse.json({ error: 'Correlation mismatch' }, { status: 409 });
        }

        const eventId = `elevenlabs:${recordingId}:${recording.externalTranscriptionId}:${deliveryStatus}`;
        const claimStatus = await claimTranscriptionWebhookEvent({
            eventId,
            provider: 'elevenlabs',
            recordingId,
            externalTranscriptionId: recording.externalTranscriptionId,
            deliveryStatus,
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

        // Handle failed transcription
        if (deliveryStatus === 'failed') {
            if (recording.transcriptionResultAttemptId === resultAttempt && recording.fullTranscript) {
                await markTranscriptionWebhookProcessed(eventId);
                return NextResponse.json({ success: true, status: 'ignored_obsolete_failure' });
            }
            if (recording.transcriptionReceipt) await settleFailedTranscription(authSubject, recording.transcriptionReceipt, undefined, 'failed');
            logger.error(`[ElevenLabs Webhook] Transcription failed: ${payload.error}`);
            await save({
                transcriptionStatus: 'failed',
                transcriptionError: 'The transcription provider rejected this recording.',
                processingStatus: processingFailure(new Error('The transcription provider rejected this recording.'), 'transcription', 'responded'),
            });

            await markTranscriptionWebhookProcessed(eventId);
            await settleQueuedTranscription(authSubject, recordingId, execution);
            after(async () => { await processTranscriptionJobs(); });

            await notifyProcessingOutcome(authSubject, recordingId, 'failed', attemptId);

            return NextResponse.json({ success: true, status: 'failed_recorded' });
        }

        // Process successful transcription
        const segments = processElevenLabsWordsIntoSegments(payload.words || []);
        const languageCode = payload.language_code || 'en';
        let completion;
        try {
            const normalizedResult = {
                segments, languageCode, provider: 'elevenlabs', providerResultId: recording.externalTranscriptionId,
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
                logger.error('[ElevenLabs Webhook] Failed to mark webhook event as failed:', markError);
            }
        }

        logger.error('[ElevenLabs Webhook] Error processing webhook:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    } finally {
        stopLease?.();
    }
}

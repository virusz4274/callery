import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { logger } from '@/lib/logger';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { Recording } from '@/lib/db/types';
import { markTranscriptionUsageReported, updateRecording } from '@/lib/db/recordings';
import { reportUsage } from '@/lib/stripe/usage';
import { findUserByFirebaseUid, incrementTranscriptionUsed } from '@/lib/db/users';
import { GeminiService } from '@/services/ai/gemini-service';
import { calculateBilledDuration } from '@/lib/utils/billing';
import { createNotification } from '@/lib/notifications';
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
 * The webhook_metadata contains the recordingId and firebaseUid for correlation.
 */

const aiService = new GeminiService();
const MAX_SIGNATURE_AGE_SECONDS = 5 * 60;

export const runtime = 'nodejs';

type ElevenLabsWebhookEnvelope = {
    type?: string;
    event_timestamp?: number;
    data?: ElevenLabsWebhookPayload;
};

function parseElevenLabsMetadata(metadata: unknown): { recordingId?: string; firebaseUid?: string } {
    if (!metadata) {
        return {};
    }

    if (typeof metadata === 'string') {
        try {
            const parsed = JSON.parse(metadata) as { recordingId?: string; firebaseUid?: string };
            return parsed ?? {};
        } catch {
            return {};
        }
    }

    if (typeof metadata === 'object') {
        const typed = metadata as { recordingId?: string; firebaseUid?: string };
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

    try {
        const webhookSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;
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
        const { recordingId, firebaseUid } = parseElevenLabsMetadata(payload.webhook_metadata);

        if (!recordingId || !firebaseUid) {
            logger.error('[ElevenLabs Webhook] Missing webhook_metadata (recordingId or firebaseUid)');
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
            firebaseUid,
        });

        if (!recording) {
            logger.error(`[ElevenLabs Webhook] Recording not found: ${recordingId}`);
            return NextResponse.json(
                { error: 'Recording not found' },
                { status: 404 }
            );
        }

        const incomingCorrelationIds = [payload.transcription_id, payload.request_id].filter(
            (value): value is string => Boolean(value)
        );

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

        // Handle failed transcription
        if (deliveryStatus === 'failed') {
            logger.error(`[ElevenLabs Webhook] Transcription failed: ${payload.error}`);
            await updateRecording(recordingId, firebaseUid, {
                transcriptionStatus: 'failed',
            });

            await markTranscriptionWebhookProcessed(eventId);

            try {
                const user = await findUserByFirebaseUid(firebaseUid);
                if (user) {
                    await createNotification(
                        user._id,
                        'error',
                        'Transcription Failed',
                        `Processing failed for \"${recording.standardizedDisplayName}\".`,
                    );
                }
            } catch (notificationError) {
                logger.error('[ElevenLabs Webhook] Failure notification delivery failed after processing:', notificationError);
            }

            return NextResponse.json({ success: true, status: 'failed_recorded' });
        }

        // Process successful transcription
        const segments = processElevenLabsWordsIntoSegments(payload.words || []);
        const languageCode = payload.language_code || 'en';

        // Update recording with transcript
        await updateRecording(recordingId, firebaseUid, {
            fullTranscript: segments,
            languageCode,
            transcriptionStatus: 'processing', // Still processing AI
        });

        logger.info(`[ElevenLabs Webhook] Saved transcript (${segments.length} segments) for ${recordingId}`);

        // Process with AI (summarization)
        try {
            const fullText = segments.map(s => `${s.speakerId}: ${s.text}`).join('\n');

            const [summary, transliteratedSegments] = await Promise.all([
                aiService.generateSummary(fullText, languageCode),
                aiService.generateTransliteration(segments, languageCode)
            ]);

            await updateRecording(recordingId, firebaseUid, {
                summary,
                fullTranscript: transliteratedSegments, // Update with transliteration
                transcriptionStatus: 'completed',
            });
            logger.info(`[ElevenLabs Webhook] AI processing complete for ${recordingId}`);
        } catch (aiError) {
            logger.error(`[ElevenLabs Webhook] AI processing failed: ${aiError}`);
            // Still mark as completed since transcript is saved
            await updateRecording(recordingId, firebaseUid, {
                transcriptionStatus: 'completed',
            });
        }

        const usageReportId = `elevenlabs:${recording.externalTranscriptionId}`;
        const shouldReportUsage = await markTranscriptionUsageReported(recordingId, firebaseUid, usageReportId);
        if (shouldReportUsage) {
            const multiplier = recording.transcriptionCostMultiplier || 1;
            const baseDuration = calculateBilledDuration(recording.duration);
            const billedCostDuration = baseDuration * multiplier;
            await incrementTranscriptionUsed(firebaseUid, billedCostDuration);
            await reportUsage(firebaseUid, 'transcription', baseDuration, {
                multiplier,
                identifier: `transcription:${firebaseUid}:recording:${recordingId}:elevenlabs:${recording.externalTranscriptionId}`,
            });

            const totalBilled = Math.ceil(baseDuration * multiplier);
            logger.info(`[ElevenLabs Webhook] Usage reported: ${totalBilled}s (Base: ${baseDuration}s * ${multiplier}x)`);
        }

        await markTranscriptionWebhookProcessed(eventId);

        try {
            const user = await findUserByFirebaseUid(firebaseUid);
            if (user) {
                await createNotification(
                    user._id,
                    'success',
                    'Transcription Ready',
                    `Your recording \"${recording.standardizedDisplayName}\" has been processed.`,
                    `/?id=${recordingId}`
                );
            }
        } catch (notificationError) {
            logger.error('[ElevenLabs Webhook] Notification delivery failed after processing:', notificationError);
        }

        return NextResponse.json({ success: true, status: 'completed' });

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
    }
}

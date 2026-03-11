import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { Recording } from '@/lib/db/types';
import { updateRecording } from '@/lib/db/recordings';
import { reportUsage } from '@/lib/stripe/usage';
import { incrementTranscriptionUsed, findUserByFirebaseUid } from '@/lib/db/users';
import { GeminiService } from '@/services/ai/gemini-service';
import { calculateBilledDuration } from '@/lib/utils/billing';
import { createNotification } from '@/lib/notifications';
import { ObjectId } from 'mongodb';
import {
    claimTranscriptionWebhookEvent,
    markTranscriptionWebhookFailed,
    markTranscriptionWebhookProcessed,
} from '@/lib/webhooks/transcription-events';
import { processSonioxWordsIntoSegments, type SonioxWebhookPayload } from './helpers';

/**
 * Soniox Webhook - Receives async transcription notifications
 * 
 * NOTE: Unlike ElevenLabs, Soniox webhooks only notify of completion.
 * They do NOT include transcript data. We must fetch it using the ID.
 */

const aiService = new GeminiService();

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

    try {
        // Extract metadata from query params
        const url = new URL(request.url);
        const recordingId = url.searchParams.get('recordingId');
        const firebaseUid = url.searchParams.get('firebaseUid');

        // Verify webhook secret
        const expectedSecret = process.env.SONIOX_WEBHOOK_SECRET;
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

        if (!recordingId || !firebaseUid) {
            logger.error('[Soniox Webhook] Missing metadata (recordingId or firebaseUid)');
            return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
        }

        if (!ObjectId.isValid(recordingId)) {
            logger.error(`[Soniox Webhook] Invalid recordingId: ${recordingId}`);
            return NextResponse.json({ error: 'Invalid recording ID' }, { status: 400 });
        }

        if (!payload?.id || !payload?.status) {
            logger.error('[Soniox Webhook] Missing required payload fields (id/status)');
            return NextResponse.json({ error: 'Missing payload fields' }, { status: 400 });
        }

        // Verify the recording exists
        const db = await getMongoDb();
        const recording = await db.collection<Recording>(Collections.RECORDINGS).findOne({
            _id: new ObjectId(recordingId),
            firebaseUid,
        });

        if (!recording) {
            logger.error(`[Soniox Webhook] Recording not found: ${recordingId}`);
            return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
        }

        if (!recording.externalTranscriptionId) {
            logger.warn(
                `[Soniox Webhook] Missing externalTranscriptionId on recording ${recordingId}. Rejecting callback for safety.`
            );
            return NextResponse.json({ error: 'Correlation not initialized' }, { status: 409 });
        }

        if (recording.externalTranscriptionId !== payload.id) {
            logger.warn(
                `[Soniox Webhook] Correlation mismatch for ${recordingId}. Expected ${recording.externalTranscriptionId}, got ${payload.id}`
            );
            return NextResponse.json({ error: 'Correlation mismatch' }, { status: 409 });
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

        // Handle error status
        if (payload.status === 'error') {
            logger.error(`[Soniox Webhook] Transcription failed for ${payload.id}`);
            await updateRecording(recordingId, firebaseUid, {
                transcriptionStatus: 'failed',
            });
            await markTranscriptionWebhookProcessed(eventId);
            return NextResponse.json({ success: true, status: 'error_recorded' });
        }

        // Fetch the actual transcript from Soniox
        const sonioxApiKey = process.env.SONIOX_API_KEY;
        const sonioxBaseUrl = process.env.SONIOX_API_BASE_URL || 'https://api.soniox.com';

        if (!sonioxApiKey) {
            logger.error('[Soniox Webhook] SONIOX_API_KEY not configured');
            throw new Error('SONIOX_API_KEY not configured');
        }

        logger.info(`[Soniox Webhook] Fetching transcript for ${payload.id}...`);

        const transcriptResponse = await fetch(`${sonioxBaseUrl}/v1/transcriptions/${payload.id}/transcript`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${sonioxApiKey}`,
            },
        });

        if (!transcriptResponse.ok) {
            const errText = await transcriptResponse.text();
            logger.error(`[Soniox Webhook] Failed to fetch transcript: ${transcriptResponse.status} - ${errText}`);
            await updateRecording(recordingId, firebaseUid, {
                transcriptionStatus: 'failed',
            });
            throw new Error(`Failed to fetch transcript (${transcriptResponse.status})`);
        }

        const transcriptData = await transcriptResponse.json();

        // Process transcript
        const words = transcriptData.tokens || transcriptData.words || [];
        const segments = processSonioxWordsIntoSegments(words);
        const languageCode = transcriptData.detected_language || 'unknown';
        const fullText = transcriptData.text || segments.map(s => s.text).join(' ');

        // Save transcript immediately
        await updateRecording(recordingId, firebaseUid, {
            fullTranscript: segments,
            languageCode,
            transcriptionStatus: 'processing', // Still processing AI
        });

        logger.info(`[Soniox Webhook] Saved transcript (${segments.length} segments) for ${recordingId}`);

        // AI Processing
        try {
            const [summary, transliteratedSegments] = await Promise.all([
                aiService.generateSummary(fullText, languageCode),
                aiService.generateTransliteration(segments, languageCode)
            ]);

            await updateRecording(recordingId, firebaseUid, {
                summary,
                fullTranscript: transliteratedSegments, // Update with transliteration
                transcriptionStatus: 'completed',
            });
            logger.info(`[Soniox Webhook] AI processing complete for ${recordingId}`);
        } catch (aiError) {
            logger.error(`[Soniox Webhook] AI processing failed: ${aiError}`);
            await updateRecording(recordingId, firebaseUid, {
                transcriptionStatus: 'completed', // Still mark complete since transcript saved
            });
        }

        // Report usage
        const multiplier = recording.transcriptionCostMultiplier || 1;
        const baseDuration = calculateBilledDuration(recording.duration);
        const billedCostDuration = baseDuration * multiplier;

        await incrementTranscriptionUsed(firebaseUid, billedCostDuration);
        await reportUsage(firebaseUid, 'transcription', baseDuration, { multiplier });

        const totalBilled = Math.ceil(baseDuration * multiplier);
        logger.info(`[Soniox Webhook] Usage reported: ${totalBilled}s (Base: ${baseDuration}s * ${multiplier}x)`);

        // Notification
        const user = await findUserByFirebaseUid(firebaseUid);
        if (user) {
            await createNotification(
                user._id,
                'success',
                'Transcription Ready',
                `Your recording "${recording.standardizedDisplayName || recording.fileName}" has been processed.`,
                `/?id=${recordingId}`
            );
        }

        await markTranscriptionWebhookProcessed(eventId);
        return NextResponse.json({ success: true, status: 'completed' });

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
    }
}

'use server';

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { Recording, TranscriptionSegment, TranscriptionWord } from '@/lib/db/types';
import { updateRecording } from '@/lib/db/recordings';
import { reportUsage } from '@/lib/stripe/usage';
import { incrementTranscriptionUsed, findUserByFirebaseUid } from '@/lib/db/users';
import { GeminiService } from '@/services/ai/gemini-service';
import { calculateBilledDuration } from '@/lib/utils/billing';
import { createNotification } from '@/lib/notifications';
import { ObjectId } from 'mongodb';

/**
 * Soniox Webhook - Receives async transcription notifications
 * 
 * NOTE: Unlike ElevenLabs, Soniox webhooks only notify of completion.
 * They do NOT include transcript data. We must fetch it using the ID.
 */

interface SonioxWebhookPayload {
    id: string;
    status: 'completed' | 'error';
}

const aiService = new GeminiService();

export async function POST(request: Request) {
    try {
        // Extract metadata from query params
        const url = new URL(request.url);
        const recordingId = url.searchParams.get('recordingId');
        const firebaseUid = url.searchParams.get('firebaseUid');

        // Verify webhook secret if configured
        const expectedSecret = process.env.SONIOX_WEBHOOK_SECRET;
        if (expectedSecret) {
            const receivedSecret = request.headers.get('X-Soniox-Secret');
            if (receivedSecret !== expectedSecret) {
                logger.warn('[Soniox Webhook] Invalid secret received');
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }

        const payload: SonioxWebhookPayload = await request.json();
        logger.info(`[Soniox Webhook] Received for transcription_id: ${payload.id}, status: ${payload.status}`);

        if (!recordingId || !firebaseUid) {
            logger.error('[Soniox Webhook] Missing metadata (recordingId or firebaseUid)');
            return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
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

        // Handle error status
        if (payload.status === 'error') {
            logger.error(`[Soniox Webhook] Transcription failed for ${payload.id}`);
            await updateRecording(recordingId, firebaseUid, {
                transcriptionStatus: 'failed',
            });
            return NextResponse.json({ success: true, status: 'error_recorded' });
        }

        // Fetch the actual transcript from Soniox
        const sonioxApiKey = process.env.SONIOX_API_KEY;
        const sonioxBaseUrl = process.env.SONIOX_API_BASE_URL || 'https://api.soniox.com';

        if (!sonioxApiKey) {
            logger.error('[Soniox Webhook] SONIOX_API_KEY not configured');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
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
            return NextResponse.json({ error: 'Failed to fetch transcript' }, { status: 500 });
        }

        const transcriptData = await transcriptResponse.json();

        // Process transcript
        const words = transcriptData.tokens || transcriptData.words || [];
        const segments = processWordsIntoSegments(words);
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
            const summary = await aiService.generateSummary(fullText, languageCode);

            await updateRecording(recordingId, firebaseUid, {
                summary,
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

        return NextResponse.json({ success: true, status: 'completed' });

    } catch (error) {
        logger.error('[Soniox Webhook] Error processing webhook:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// Helper to format speaker ID
function formatSpeakerId(speakerId: number | string | undefined): string {
    if (speakerId === undefined || speakerId === null) return 'Unknown';
    return `Speaker ${speakerId}`;
}

// Process words into segments grouped by speaker
function processWordsIntoSegments(words: any[]): TranscriptionSegment[] {
    const segments: TranscriptionSegment[] = [];
    if (!words || words.length === 0) return segments;

    let currentSegment: TranscriptionSegment | null = null;
    let currentSpeakerId: string | null = null;

    for (const word of words) {
        const wordSpeakerId = String(word.speaker);

        if (!currentSegment || wordSpeakerId !== currentSpeakerId) {
            if (currentSegment) {
                segments.push(currentSegment);
            }
            currentSpeakerId = wordSpeakerId;
            currentSegment = {
                speakerId: formatSpeakerId(word.speaker),
                text: '',
                start: (word.start_ms || 0) / 1000,
                end: (word.end_ms || 0) / 1000,
                words: [],
            };
        }

        const mappedWord: TranscriptionWord = {
            text: word.text,
            start: (word.start_ms || 0) / 1000,
            end: (word.end_ms || 0) / 1000,
            speakerId: String(word.speaker),
            confidence: word.confidence,
        };

        currentSegment.words.push(mappedWord);
        currentSegment.text += (currentSegment.text ? ' ' : '') + word.text;
        currentSegment.end = (word.end_ms || 0) / 1000;
    }

    if (currentSegment) {
        segments.push(currentSegment);
    }

    return segments;
}

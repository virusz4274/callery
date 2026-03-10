'use server';

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { Recording } from '@/lib/db/types';
import { updateRecording } from '@/lib/db/recordings';
import { reportUsage } from '@/lib/stripe/usage';
import { findUserByFirebaseUid, incrementTranscriptionUsed } from '@/lib/db/users';
import { GeminiService } from '@/services/ai/gemini-service';
import { calculateBilledDuration } from '@/lib/utils/billing';
import { createNotification } from '@/lib/notifications';
import { processElevenLabsWordsIntoSegments, type ElevenLabsWebhookPayload } from './helpers';

/**
 * ElevenLabs Webhook - Receives async transcription results
 * 
 * This endpoint is called by ElevenLabs when an async transcription completes.
 * The webhook_metadata contains the recordingId and firebaseUid for correlation.
 */

const aiService = new GeminiService();

export async function POST(request: Request) {
    try {
        const payload: ElevenLabsWebhookPayload = await request.json();

        logger.info(`[ElevenLabs Webhook] Received for request_id: ${payload.request_id}`);

        // Validate required metadata
        const { recordingId, firebaseUid } = payload.webhook_metadata || {};

        if (!recordingId || !firebaseUid) {
            logger.error('[ElevenLabs Webhook] Missing webhook_metadata (recordingId or firebaseUid)');
            return NextResponse.json(
                { error: 'Missing webhook_metadata' },
                { status: 400 }
            );
        }

        // Verify the recording exists and belongs to the user
        const db = await getMongoDb();
        const recording = await db.collection<Recording>(Collections.RECORDINGS).findOne({
            _id: new (await import('mongodb')).ObjectId(recordingId),
            firebaseUid,
        });

        if (!recording) {
            logger.error(`[ElevenLabs Webhook] Recording not found: ${recordingId}`);
            return NextResponse.json(
                { error: 'Recording not found' },
                { status: 404 }
            );
        }

        // Handle failed transcription
        if (payload.status === 'failed') {
            logger.error(`[ElevenLabs Webhook] Transcription failed: ${payload.error}`);
            await updateRecording(recordingId, firebaseUid, {
                transcriptionStatus: 'failed',
            });

            const user = await findUserByFirebaseUid(firebaseUid);
            if (user) {
                await createNotification(
                    user._id,
                    'error',
                    'Transcription Failed',
                    `Processing failed for \"${recording.standardizedDisplayName || recording.fileName}\".`,
                );
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

        // Report usage
        // Note: reportUsage applies the multiplier internally (quantity * multiplier)
        // We pass the base duration (rounded up) and the multiplier.
        const multiplier = recording.transcriptionCostMultiplier || 1;
        const baseDuration = calculateBilledDuration(recording.duration);
        const billedCostDuration = baseDuration * multiplier;
        await incrementTranscriptionUsed(firebaseUid, billedCostDuration);
        await reportUsage(firebaseUid, 'transcription', baseDuration, { multiplier });

        const totalBilled = Math.ceil(baseDuration * multiplier);
        logger.info(`[ElevenLabs Webhook] Usage reported: ${totalBilled}s (Base: ${baseDuration}s * ${multiplier}x)`);

        const user = await findUserByFirebaseUid(firebaseUid);
        if (user) {
            await createNotification(
                user._id,
                'success',
                'Transcription Ready',
                `Your recording \"${recording.standardizedDisplayName || recording.fileName}\" has been processed.`,
                `/?id=${recordingId}`
            );
        }

        return NextResponse.json({ success: true, status: 'completed' });

    } catch (error) {
        logger.error('[ElevenLabs Webhook] Error processing webhook:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

'use server';

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { Recording, TranscriptionSegment, TranscriptionWord } from '@/lib/db/types';
import { updateRecording } from '@/lib/db/recordings';
import { reportUsage } from '@/lib/stripe/usage';
import { findUserByFirebaseUid } from '@/lib/db/users';
import { GeminiService } from '@/services/ai/gemini-service';

/**
 * ElevenLabs Webhook - Receives async transcription results
 * 
 * This endpoint is called by ElevenLabs when an async transcription completes.
 * The webhook_metadata contains the recordingId and firebaseUid for correlation.
 */

interface ElevenLabsWebhookPayload {
    request_id: string;
    transcription_id: string;
    status: 'success' | 'failed';
    text?: string;
    words?: Array<{
        text: string;
        start: number;
        end: number;
        speaker_id?: string;
        type?: string;
    }>;
    language_code?: string;
    webhook_metadata?: {
        recordingId: string;
        firebaseUid: string;
    };
    error?: string;
}

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
            return NextResponse.json({ success: true, status: 'failed_recorded' });
        }

        // Process successful transcription
        const segments = processWordsIntoSegments(payload.words || []);
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
        const baseDuration = Math.ceil(recording.duration);
        await reportUsage(firebaseUid, 'transcription', baseDuration, { multiplier });

        const totalBilled = Math.ceil(baseDuration * multiplier);
        logger.info(`[ElevenLabs Webhook] Usage reported: ${totalBilled}s (Base: ${baseDuration}s * ${multiplier}x)`);

        return NextResponse.json({ success: true, status: 'completed' });

    } catch (error) {
        logger.error('[ElevenLabs Webhook] Error processing webhook:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// Helper to format speaker ID
function formatSpeakerId(speakerId: string | undefined): string {
    if (!speakerId) return 'Unknown';
    return speakerId.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Process words into segments grouped by speaker
function processWordsIntoSegments(words: ElevenLabsWebhookPayload['words']): TranscriptionSegment[] {
    const segments: TranscriptionSegment[] = [];
    if (!words || words.length === 0) return segments;

    let currentSegment: TranscriptionSegment | null = null;
    let currentSpeakerId: string | null = null;

    for (const word of words) {
        const wordSpeakerId = word.speaker_id || 'unknown';

        if (!currentSegment || wordSpeakerId !== currentSpeakerId) {
            if (currentSegment) {
                segments.push(currentSegment);
            }
            currentSpeakerId = wordSpeakerId;
            currentSegment = {
                speakerId: formatSpeakerId(wordSpeakerId),
                text: '',
                start: word.start || 0,
                end: word.end || 0,
                words: [],
            };
        }

        const mappedWord: TranscriptionWord = {
            text: word.text,
            start: word.start,
            end: word.end,
            speakerId: wordSpeakerId,
        };

        currentSegment.words.push(mappedWord);
        currentSegment.text += (currentSegment.text ? ' ' : '') + word.text;
        currentSegment.end = word.end || currentSegment.end;
    }

    if (currentSegment) {
        segments.push(currentSegment);
    }

    return segments;
}

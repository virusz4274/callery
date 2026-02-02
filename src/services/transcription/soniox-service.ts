import { ITranscriptionService, TranscriptionResult, SonioxPollResponse } from './types';
import { TranscriptionSegment, TranscriptionWord } from '@/lib/db/types';
import { logSystemEvent } from '@/lib/db/system-log';
import { logger } from '@/lib/logger';

export class SonioxService implements ITranscriptionService {
    private apiKey: string;
    private baseUrl: string;
    private model: string;

    constructor() {
        if (!process.env.SONIOX_API_KEY) {
            logger.warn('SONIOX_API_KEY is not defined. Transcription will fail.');
        }
        this.apiKey = process.env.SONIOX_API_KEY || '';
        this.baseUrl = process.env.SONIOX_API_BASE_URL || 'https://api.soniox.com';
        this.model = process.env.SONIOX_MODEL_ID || 'stt-async-v3';
    }

    async transcribe(fileUrl: string, durationSeconds?: number): Promise<TranscriptionResult> {
        if (!this.apiKey) {
            throw new Error('SONIOX_API_KEY is not defined');
        }

        try {
            logger.debug(`[Soniox] Requesting transcription for: ${fileUrl}`);
            const startResponse = await fetch(`${this.baseUrl}/v1/transcriptions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    audio_url: fileUrl,
                    model: this.model,
                    enable_speaker_diarization: true,
                }),
            });

            if (!startResponse.ok) {
                const errorText = await startResponse.text();
                logger.error(`[Soniox] Start Error (${startResponse.status}): ${errorText}`);

                // Handle Billing/Quota Errors
                if (startResponse.status === 402 || startResponse.status === 429 || (startResponse.status === 403 && errorText.includes('quota'))) {
                    await logSystemEvent(
                        'SONIOX_BILLING_ERROR',
                        {
                            status: startResponse.status,
                            error: errorText,
                            timestamp: new Date().toISOString()
                        },
                        'SONIOX_SERVICE',
                        'SYSTEM'
                    );

                    throw new Error('Transcription service temporarily unavailable due to quota limits.');
                }

                throw new Error(`Failed to start Soniox transcription: ${startResponse.status}`);
            }

            const startData = await startResponse.json();
            const transcriptionId = startData.id;

            if (!transcriptionId) {
                logger.error('[Soniox] No transcription ID in response:', startData);
                throw new Error('No transcription_id returned from Soniox');
            }

            logger.info(`[Soniox] Started transcription ID: ${transcriptionId}`);

            // 2. Poll for Completion
            // Smart Delay: Wait for ~30% of audio duration (capped at 30s) before first poll
            // Min wait 2s
            const initialWaitMs = durationSeconds
                ? Math.min(durationSeconds * 0.3 * 1000, 30000)
                : 2000;

            const safeWaitMs = Math.max(initialWaitMs, 2000);
            logger.debug(`[Soniox] Smart Polling: Waiting ${safeWaitMs}ms before first check (Duration: ${durationSeconds || '?'}s)`);

            // Poll every 2 seconds, with max 500 attempts (~15 mins)
            let resultData: SonioxPollResponse | null = null;
            let status = 'QUEUED';
            let attempts = 0;
            const maxAttempts = 500;

            // Initial Wait
            await new Promise(resolve => setTimeout(resolve, safeWaitMs));

            while (attempts < maxAttempts) {
                // Regular poll interval
                if (attempts > 0) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                attempts++;

                const pollResponse = await fetch(`${this.baseUrl}/v1/transcriptions/${transcriptionId}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                    },
                });

                if (!pollResponse.ok) {
                    // If polling fails, log but maybe retry?
                    logger.warn(`[Soniox] Polling failed: ${pollResponse.status}`);
                    continue;
                }

                const data = (await pollResponse.json()) as SonioxPollResponse;
                status = (data.status || 'UNKNOWN').toUpperCase();

                // Removed verbose logs per audit
                // logger.debug(`[Soniox] Poll #${attempts} status: ${status}`);

                // Check for completion
                if (status === 'COMPLETED') {
                    logger.info(`[Soniox] Transcription status is COMPLETED at attempt ${attempts}. Fetching full transcript...`);

                    // Final fetch for the actual transcript data
                    const transcriptResponse = await fetch(`${this.baseUrl}/v1/transcriptions/${transcriptionId}/transcript`, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`,
                        },
                    });

                    if (!transcriptResponse.ok) {
                        const err = await transcriptResponse.text();
                        logger.error(`[Soniox] Failed to fetch transcript data (${transcriptResponse.status}): ${err}`);
                        throw new Error(`Failed to fetch Soniox transcript data: ${transcriptResponse.status}`);
                    }

                    resultData = await transcriptResponse.json() as SonioxPollResponse;
                    logger.info(`[Soniox] Successfully fetched transcript data. Tokens: ${resultData.tokens?.length || 0}`);
                    break;
                } else if (status === 'FAILED') {
                    logger.error('[Soniox] Transcription status FAILED:', data.error_message);
                    throw new Error(`Soniox transcription failed: ${data.error_message || 'Unknown error'}`);
                }

                // Keep heartbeat log less frequent
                if (attempts % 10 === 0) {
                    logger.debug(`[Soniox] Still waiting for ${transcriptionId}... (Status: ${status})`);
                }
            }

            if (!resultData) {
                logger.error(`[Soniox] Polling timed out or failed after ${attempts} attempts`);
                throw new Error('Transcription timed out or did not complete successfully.');
            }

            logger.debug('[Soniox] Beginning result processing...');
            const words = resultData.tokens || resultData.words || [];
            const segments = this.processWordsIntoSegments(words);

            const detectedLanguage = resultData.detected_language || 'unknown';
            logger.info(`[Soniox] Processed ${segments.length} segments. Language: ${detectedLanguage}`);

            // Construct full text from words if not provided directly
            // Soniox results often include full text, but let's build it if segments exist check
            // resultData.text might exist.
            const fullText = resultData.text || segments.map(s => s.text).join(' ');

            return {
                text: fullText,
                languageCode: detectedLanguage,
                segments,
                transcriptionId,
            };

        } catch (error) {
            logger.error('[Soniox] Transcription Error:', error);
            throw error;
        }
    }

    async deleteTranscript(transcriptionId: string): Promise<void> {
        if (!transcriptionId) return;

        try {
            const response = await fetch(`${this.baseUrl}/v1/transcriptions/${transcriptionId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                },
            });

            if (!response.ok) {
                if (response.status === 404) {
                    logger.warn(`[Soniox] Transcript ${transcriptionId} not found (already deleted?)`);
                    return;
                }
                logger.error(`[Soniox] Failed to delete transcript: ${response.status}`);
            }
        } catch (error) {
            logger.error('[Soniox] Delete Error:', error);
        }
    }

    private formatSpeakerId(speakerId: number | string | undefined): string {
        if (speakerId === undefined || speakerId === null) return 'Unknown';
        // Soniox usually returns integer speaker IDs (0, 1, 2)
        return `Speaker ${speakerId}`;
    }

    private processWordsIntoSegments(words: any[]): TranscriptionSegment[] {
        const segments: TranscriptionSegment[] = [];
        if (!words || words.length === 0) return segments;

        let currentSegment: TranscriptionSegment | null = null;
        let currentSpeakerId: string | null = null;

        for (const word of words) {
            // Soniox word structure: { text: "Hello", start_ms: 100, end_ms: 500, speaker: 0 }
            const wordSpeakerId = String(word.speaker); // Ensure string comparison

            // Start new segment when speaker changes
            if (!currentSegment || wordSpeakerId !== currentSpeakerId) {
                if (currentSegment) {
                    segments.push(currentSegment);
                }
                currentSpeakerId = wordSpeakerId;
                currentSegment = {
                    speakerId: this.formatSpeakerId(word.speaker),
                    text: '',
                    start: (word.start_ms || 0) / 1000,
                    end: (word.end_ms || 0) / 1000,
                    words: [],
                };
            }

            // Map Soniox token to TranscriptionWord format
            const mappedWord: TranscriptionWord = {
                text: word.text,
                start: (word.start_ms || 0) / 1000,
                end: (word.end_ms || 0) / 1000,
                speakerId: String(word.speaker),
                confidence: word.confidence,
            };

            // Add word to current segment
            currentSegment.words.push(mappedWord);
            currentSegment.text += (currentSegment.text ? ' ' : '') + word.text;
            currentSegment.end = (word.end_ms || 0) / 1000;
        }

        // Push final segment
        if (currentSegment) {
            segments.push(currentSegment);
        }

        return segments;
    }
}

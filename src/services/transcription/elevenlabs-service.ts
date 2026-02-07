
import { ITranscriptionService, TranscriptionResult, TranscribeOptions, TranscribeAsyncOptions, TranscribeAsyncResult } from './types';
import { TranscriptionSegment, TranscriptionWord } from '@/lib/db/types';
import { logSystemEvent } from '@/lib/db/system-log';
import { logger } from '@/lib/logger';

export class ElevenLabsService implements ITranscriptionService {
    private apiKey: string;
    private baseUrl: string;
    private model: string;
    public readonly provider = 'elevenlabs';

    constructor() {
        if (!process.env.ELEVENLABS_API_KEY) {
            logger.warn('ELEVENLABS_API_KEY is not defined. Transcription will fail.');
        }
        this.apiKey = process.env.ELEVENLABS_API_KEY || '';
        this.baseUrl = process.env.ELEVENLABS_API_BASE_URL || 'https://api.elevenlabs.io';
        this.model = process.env.ELEVENLABS_MODEL_ID || 'scribe_v2'; // Scribe v2
    }

    async transcribe(fileUrl: string, options?: TranscribeOptions): Promise<TranscriptionResult> {
        if (!this.apiKey) {
            throw new Error('ELEVENLABS_API_KEY is not defined');
        }

        // Allow model override if passed, otherwise default
        const modelToUse = options?.model || this.model;

        try {
            logger.info(`[ElevenLabs] Requesting transcription for: ${fileUrl} (Model: ${modelToUse})`);

            const formData = new FormData();
            formData.append('model_id', modelToUse);
            formData.append('cloud_storage_url', fileUrl);
            formData.append('diarize', 'true');
            // formData.append('timestamps_granularity', 'word'); // default is word

            const response = await fetch(`${this.baseUrl}/v1/speech-to-text`, {
                method: 'POST',
                headers: {
                    'xi-api-key': this.apiKey,
                },
                body: formData,
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`[ElevenLabs] API Error (${response.status}): ${errorText}`);

                if (response.status === 401) {
                    throw new Error('ElevenLabs API Auth failed');
                }

                throw new Error(`ElevenLabs API failed: ${response.status} ${errorText}`);
            }

            const data = await response.json();

            // Map the response
            const segments = this.processWordsIntoSegments(data.words || []);
            const language = data.language_code || 'en'; // default if missing
            const transcriptionId = data.transcription_id || `el_${Date.now()}`; // Fallback ID if not returned in sync mode

            logger.info(`[ElevenLabs] Success. ${segments.length} segments. Language: ${language}`);

            return {
                text: data.text || segments.map(s => s.text).join(' '),
                languageCode: language,
                segments: segments,
                transcriptionId,
                provider: 'elevenlabs',
                model: modelToUse
            };

        } catch (error) {
            logger.error('[ElevenLabs] Transcription Error:', error);
            throw error;
        }
    }

    /**
     * Start an async transcription that will deliver results via webhook.
     * Returns immediately with a request ID for correlation.
     */
    async transcribeAsync(fileUrl: string, options?: TranscribeAsyncOptions): Promise<TranscribeAsyncResult> {
        if (!this.apiKey) {
            throw new Error('ELEVENLABS_API_KEY is not defined');
        }

        const modelToUse = options?.model || this.model;

        try {
            logger.info(`[ElevenLabs] Starting ASYNC transcription for: ${fileUrl} (Model: ${modelToUse})`);

            const formData = new FormData();
            formData.append('model_id', modelToUse);
            formData.append('cloud_storage_url', fileUrl);
            formData.append('diarize', 'true');
            formData.append('webhook', 'true'); // Enable async mode

            // Include metadata for webhook correlation
            if (options?.webhookMetadata) {
                formData.append('webhook_metadata', JSON.stringify(options.webhookMetadata));
            }

            const response = await fetch(`${this.baseUrl}/v1/speech-to-text`, {
                method: 'POST',
                headers: {
                    'xi-api-key': this.apiKey,
                },
                body: formData,
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`[ElevenLabs] Async API Error (${response.status}): ${errorText}`);
                throw new Error(`ElevenLabs API failed: ${response.status} ${errorText}`);
            }

            const data = await response.json();

            logger.info(`[ElevenLabs] Async request submitted. Request ID: ${data.request_id}`);

            return {
                requestId: data.request_id,
                transcriptionId: data.transcription_id,
                message: data.message || 'Transcription queued for processing',
            };

        } catch (error) {
            logger.error('[ElevenLabs] Async Transcription Error:', error);
            throw error;
        }
    }

    async deleteTranscript(transcriptionId: string): Promise<void> {
        // ElevenLabs doesn't have a specific "delete transcript" endpoint for the Sync/Scribe API 
        // unless we used stored storage. If we use logging=false (default is true), it stores it.
        // We might want to use GET /v1/speech-to-text/transcripts/{transcription_id} to check existence,
        // but DELETE endpoint documentation wasn't provided in the snippet.
        // For now, we'll log.
        logger.debug(`[ElevenLabs] Delete requested for ${transcriptionId} - Not implemented (API limitation or zero-retention mode used)`);
    }

    private formatSpeakerId(speakerId: string | undefined): string {
        if (!speakerId) return 'Unknown';
        return speakerId.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()); // "speaker_1" -> "Speaker 1"
    }

    private processWordsIntoSegments(words: any[]): TranscriptionSegment[] {
        const segments: TranscriptionSegment[] = [];
        if (!words || words.length === 0) return segments;

        let currentSegment: TranscriptionSegment | null = null;
        let currentSpeakerId: string | null = null;

        for (const word of words) {
            // ElevenLabs word: { text: "Hello", start: 0.1, end: 0.5, speaker_id: "speaker_1", type: "word" }
            const wordSpeakerId = word.speaker_id || 'unknown';

            // Start new segment when speaker changes
            if (!currentSegment || wordSpeakerId !== currentSpeakerId) {
                if (currentSegment) {
                    segments.push(currentSegment);
                }
                currentSpeakerId = wordSpeakerId;
                currentSegment = {
                    speakerId: this.formatSpeakerId(wordSpeakerId),
                    text: '',
                    start: word.start || 0,
                    end: word.end || 0,
                    words: [],
                };
            }

            // Map to internal structure
            const mappedWord: TranscriptionWord = {
                text: word.text,
                start: word.start,
                end: word.end,
                speakerId: wordSpeakerId,
                // confidence: word.logprob ? Math.exp(word.logprob) : undefined // optional mapping
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
}

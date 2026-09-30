import { ITranscriptionService, TranscriptionResult } from './types';
import { TranscriptionSegment, TranscriptionWord } from '@/lib/db/types';
import { logger } from '@/lib/logger';

/** Word shape returned by ElevenLabs Scribe (`timestamps_granularity=word`). */
export interface ScribeWord {
    text: string;
    type?: string;
    start?: number;
    end?: number;
    speaker_id?: string;
    logprob?: number;
}

interface ScribeResponse {
    text?: string;
    language_code?: string;
    words?: ScribeWord[];
}

function formatSpeakerId(speakerId: string | undefined): string {
    if (!speakerId) return 'Unknown';
    const match = speakerId.match(/^speaker_(\d+)$/);
    if (match) return `Speaker ${match[1]}`;
    return speakerId;
}

/**
 * Group Scribe words into speaker segments. Exported for unit testing.
 * Audio-event words (e.g. "[laughs]") often lack a speaker — they join the
 * current segment instead of starting a new one.
 */
export function mapScribeWordsToSegments(words: ScribeWord[]): TranscriptionSegment[] {
    const segments: TranscriptionSegment[] = [];
    if (!words || words.length === 0) return segments;

    let currentSegment: TranscriptionSegment | null = null;
    let currentSpeakerKey: string | null = null;

    for (const word of words) {
        if (!word.text) continue;
        const speakerKey: string = word.speaker_id ?? currentSpeakerKey ?? 'unknown';

        if (!currentSegment || speakerKey !== currentSpeakerKey) {
            if (currentSegment) {
                segments.push(currentSegment);
            }
            currentSpeakerKey = speakerKey;
            currentSegment = {
                speakerId: formatSpeakerId(speakerKey === 'unknown' ? undefined : speakerKey),
                text: '',
                start: word.start ?? 0,
                end: word.end ?? 0,
                words: [],
            };
        }

        const mappedWord: TranscriptionWord = {
            text: word.text,
            start: word.start ?? 0,
            end: word.end ?? 0,
            speakerId: speakerKey,
            // Scribe reports log-probability; convert to a 0-1 confidence.
            confidence: word.logprob !== undefined ? Math.exp(word.logprob) : undefined,
        };

        currentSegment.words.push(mappedWord);
        currentSegment.text += (currentSegment.text ? ' ' : '') + word.text;
        currentSegment.end = word.end ?? currentSegment.end;
    }

    if (currentSegment) {
        segments.push(currentSegment);
    }

    return segments;
}

export class ElevenLabsService implements ITranscriptionService {
    private apiKey: string;
    private baseUrl: string;
    private model: string;

    constructor() {
        if (!process.env.ELEVENLABS_API_KEY) {
            logger.warn('ELEVENLABS_API_KEY is not defined. Transcription will fail.');
        }
        this.apiKey = process.env.ELEVENLABS_API_KEY || '';
        this.baseUrl = process.env.ELEVENLABS_API_BASE_URL || 'https://api.elevenlabs.io';
        this.model = process.env.ELEVENLABS_MODEL_ID || 'scribe_v2';
    }

    async transcribe(fileUrl: string, durationSeconds?: number): Promise<TranscriptionResult> {
        if (!this.apiKey) {
            throw new Error('ELEVENLABS_API_KEY is not defined');
        }

        // Scribe accepts a remote URL directly, so the presigned file URL is
        // passed through — no server-side download needed.
        const form = new FormData();
        form.append('model_id', this.model);
        form.append('cloud_storage_url', fileUrl);
        form.append('diarize', 'true');
        form.append('timestamps_granularity', 'word');
        form.append('tag_audio_events', 'true');

        logger.debug(`[ElevenLabs] Requesting transcription (model: ${this.model})`);
        const response = await fetch(`${this.baseUrl}/v1/speech-to-text`, {
            method: 'POST',
            headers: { 'xi-api-key': this.apiKey },
            body: form,
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error(`[ElevenLabs] Error (${response.status}): ${errorText}`);
            if (response.status === 401) {
                throw new Error('ElevenLabs authentication failed. Check ELEVENLABS_API_KEY.');
            }
            if (response.status === 402 || response.status === 429) {
                throw new Error('Transcription service temporarily unavailable due to quota limits.');
            }
            throw new Error(`Failed to transcribe with ElevenLabs: ${response.status}`);
        }

        const data = (await response.json()) as ScribeResponse;
        const segments = mapScribeWordsToSegments(data.words ?? []);
        logger.info(`[ElevenLabs] Processed ${segments.length} segments. Language: ${data.language_code || 'unknown'}`);

        // Fallback: text without word timestamps becomes one untimed segment.
        const finalSegments =
            segments.length > 0 || !data.text?.trim()
                ? segments
                : [
                      {
                          speakerId: 'Unknown',
                          text: data.text.trim(),
                          start: 0,
                          end: durationSeconds ?? 0,
                          words: [],
                      } satisfies TranscriptionSegment,
                  ];

        return {
            text: data.text || finalSegments.map((s) => s.text).join(' '),
            languageCode: data.language_code || 'unknown',
            segments: finalSegments,
            // Scribe is synchronous and returns no transcript id; the id is
            // only used for the (no-op) delete call below.
            transcriptionId: `elevenlabs-${Date.now()}`,
        };
    }

    async deleteTranscript(_transcriptionId: string): Promise<void> {
        // Scribe is a synchronous request/response API — nothing persists
        // server-side for us to delete.
    }
}

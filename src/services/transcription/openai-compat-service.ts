import { ITranscriptionService, TranscriptionResult, TranscribeOptions } from './types';
import { compatTranscriptionConfig } from '@/lib/config';
import { TranscriptionSegment, TranscriptionWord } from '@/lib/db/types';
import { logger } from '@/lib/logger';

/** Whisper `verbose_json` shapes (OpenAI audio/transcriptions API). */
export interface WhisperSegment {
    start?: unknown;
    end?: unknown;
    text?: unknown;
}

export interface WhisperWord {
    word?: unknown;
    start?: unknown;
    end?: unknown;
}

export interface WhisperVerboseJson {
    text?: unknown;
    language?: unknown;
    segments?: unknown;
    words?: unknown;
}

function asNonNegative(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * Map a Whisper verbose_json response to segments. Three tiers, best first:
 * API segments with words attached by time overlap; words chunked into
 * pause-delimited segments when the server omits segments; a single untimed
 * segment when only text comes back. Never throws. Exported for testing.
 *
 * Note: Whisper-family servers don't diarize, so every segment is 'Unknown'
 * unless the caller assigns speakers later.
 */
export function mapWhisperVerboseToSegments(
    data: WhisperVerboseJson,
    durationSeconds?: number,
): TranscriptionSegment[] {
    const clamp = (value: number): number =>
        durationSeconds !== undefined ? Math.min(Math.max(value, 0), durationSeconds) : Math.max(value, 0);

    const rawSegments = Array.isArray(data.segments) ? (data.segments as WhisperSegment[]) : [];
    const rawWords = Array.isArray(data.words) ? (data.words as WhisperWord[]) : [];

    const toWord = (raw: WhisperWord, fallbackStart: number): TranscriptionWord | null => {
        if (typeof raw.word !== 'string' || !raw.word) return null;
        const start = clamp(asNonNegative(raw.start, fallbackStart));
        return { text: raw.word, start, end: clamp(asNonNegative(raw.end, start)) };
    };

    // Tier 1: API segments, words attached by time overlap.
    const validSegments = rawSegments.filter(
        (s): s is WhisperSegment & { text: string } => typeof s.text === 'string' && !!s.text.trim(),
    );
    if (validSegments.length > 0) {
        return validSegments.map((raw) => {
            const start = clamp(asNonNegative(raw.start, 0));
            const end = clamp(asNonNegative(raw.end, start));
            const words: TranscriptionWord[] = [];
            for (const rawWord of rawWords) {
                const wordStart = asNonNegative(rawWord.start, -1);
                if (wordStart >= start && wordStart <= end) {
                    const word = toWord(rawWord, start);
                    if (word) words.push(word);
                }
            }
            return { speakerId: 'Unknown', text: raw.text.trim(), start, end, words };
        });
    }

    // Tier 2: words only — chunk on pauses >0.8s (cap 40 words per segment).
    const words: TranscriptionWord[] = [];
    for (const rawWord of rawWords) {
        const word = toWord(rawWord, words.length > 0 ? words[words.length - 1].end ?? 0 : 0);
        if (word) words.push(word);
    }
    if (words.length > 0) {
        const segments: TranscriptionSegment[] = [];
        let current: TranscriptionWord[] = [];
        for (const word of words) {
            const prev = current.length > 0 ? current[current.length - 1] : null;
            if (prev && (word.start ?? 0) - (prev.end ?? 0) > 0.8) {
                segments.push(chunkToSegment(current));
                current = [];
            }
            current.push(word);
            if (current.length >= 40) {
                segments.push(chunkToSegment(current));
                current = [];
            }
        }
        if (current.length > 0) segments.push(chunkToSegment(current));
        return segments;
    }

    // Tier 3: text only — single untimed segment (or nothing when empty).
    if (typeof data.text === 'string' && data.text.trim()) {
        return [
            {
                speakerId: 'Unknown',
                text: data.text.trim(),
                start: 0,
                end: durationSeconds ?? 0,
                words: [],
            },
        ];
    }
    return [];
}

function chunkToSegment(words: TranscriptionWord[]): TranscriptionSegment {
    return {
        speakerId: 'Unknown',
        text: words.map((w) => w.text).join(' '),
        start: words[0].start ?? 0,
        end: words[words.length - 1].end ?? 0,
        words,
    };
}

export class OpenAiCompatTranscriptionService implements ITranscriptionService {
    constructor() {
        if (!compatTranscriptionConfig()) {
            logger.warn(
                'TRANSCRIPTION_COMPAT_BASE_URL / TRANSCRIPTION_COMPAT_MODEL are not set. Compatible transcription will fail.',
            );
        }
    }

    async transcribe(fileUrl: string, options?: TranscribeOptions): Promise<TranscriptionResult> {
        const durationSeconds = options?.durationSeconds;
        const cfg = compatTranscriptionConfig();
        if (!cfg) {
            throw new Error(
                'Missing TRANSCRIPTION_COMPAT_BASE_URL / TRANSCRIPTION_COMPAT_MODEL (TRANSCRIPTION_PROVIDER=openai_compat). See .env.example.',
            );
        }

        // Whisper-API servers take file uploads, not URLs — download first.
        const audioResponse = await fetch(fileUrl);
        if (!audioResponse.ok) {
            throw new Error(`Failed to download audio for transcription: ${audioResponse.status}`);
        }
        const mimeType = audioResponse.headers.get('content-type')?.split(';')[0] || 'audio/mpeg';
        const blob = new Blob([Buffer.from(await audioResponse.arrayBuffer())], { type: mimeType });

        const form = new FormData();
        form.append('file', blob, decodeURIComponent(new URL(fileUrl).pathname.split('/').pop() || 'audio'));
        form.append('model', options?.model || cfg.model);
        form.append('response_format', 'verbose_json');
        form.append('timestamp_granularities[]', 'word');

        logger.debug(`[Compat] Requesting transcription (model: ${cfg.model})`);
        const response = await fetch(`${cfg.baseUrl}/audio/transcriptions`, {
            method: 'POST',
            headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {},
            body: form,
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error(`[Compat] Error (${response.status}): ${errorText}`);
            if (response.status === 401) {
                throw new Error('Transcription server authentication failed. Check TRANSCRIPTION_COMPAT_API_KEY.');
            }
            if (response.status === 429) {
                throw new Error('Transcription service temporarily unavailable due to quota limits.');
            }
            throw new Error(`Failed to transcribe: ${response.status}`);
        }

        const data = (await response.json()) as WhisperVerboseJson;
        const segments = mapWhisperVerboseToSegments(data, durationSeconds);
        const text = typeof data.text === 'string' && data.text.trim()
            ? data.text.trim()
            : segments.map((s) => s.text).join(' ');
        const languageCode = typeof data.language === 'string' && data.language ? data.language : 'unknown';
        logger.info(`[Compat] Processed ${segments.length} segments. Language: ${languageCode}`);

        return {
            provider: 'openai_compat',
            model: options?.model || cfg.model,
            text,
            languageCode,
            segments,
            // Whisper-API is synchronous with no transcript id; only used for the no-op delete.
            transcriptionId: `compat-${Date.now()}`,
        };
    }

    async deleteTranscript(_transcriptionId: string): Promise<void> {
        // Synchronous request/response API — nothing persists server-side to delete.
    }
}

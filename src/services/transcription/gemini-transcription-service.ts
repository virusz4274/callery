import { ITranscriptionService, TranscriptionResult, TranscribeOptions } from './types';
import { getGeminiClient, hasGeminiKey } from '@/services/ai/client';
import { TranscriptionSegment, TranscriptionWord } from '@/lib/db/types';
import { logger } from '@/lib/logger';
import { geminiModel } from '@/lib/config';
import { AudioTranscriptionConfigMode, type Transcription } from '@google/genai';

/**
 * Expected shape of the model's JSON answer. Everything is optional at the
 * type level because model output is untrusted — parseGeminiTranscript
 * validates and falls back instead of throwing.
 */
export interface GeminiTranscriptJson {
    language?: unknown;
    segments?: unknown;
}

function asFinite(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function formatSpeakerId(speaker: unknown): string {
    if (typeof speaker !== 'string' || !speaker) return 'Unknown';
    const match = speaker.match(/^speaker_(\d+)$/i);
    if (match) return `Speaker ${match[1]}`;
    return speaker;
}

/**
 * Validate untrusted model JSON into segments. Returns zero or more valid
 * segments plus the detected language; callers fall back to a single
 * untimed segment when nothing valid comes back. Exported for unit testing.
 */
export function parseGeminiTranscript(
    json: unknown,
    durationSeconds?: number,
): { languageCode: string; segments: TranscriptionSegment[] } {
    const languageCode =
        typeof json === 'object' && json !== null && typeof (json as GeminiTranscriptJson).language === 'string'
            ? ((json as GeminiTranscriptJson).language as string) || 'unknown'
            : 'unknown';

    const clamp = (value: number): number =>
        durationSeconds !== undefined ? Math.min(Math.max(value, 0), durationSeconds) : Math.max(value, 0);

    const segments: TranscriptionSegment[] = [];
    const rawSegments =
        typeof json === 'object' && json !== null && Array.isArray((json as GeminiTranscriptJson).segments)
            ? ((json as GeminiTranscriptJson).segments as unknown[])
            : [];

    for (const raw of rawSegments) {
        if (typeof raw !== 'object' || raw === null) continue;
        const record = raw as Record<string, unknown>;
        if (typeof record.text !== 'string' || !record.text.trim()) continue;

        const start = clamp(asFinite(record.start, 0));
        const end = clamp(asFinite(record.end, start));

        const words: TranscriptionWord[] = [];
        if (Array.isArray(record.words)) {
            for (const rawWord of record.words) {
                if (typeof rawWord !== 'object' || rawWord === null) continue;
                const wordRecord = rawWord as Record<string, unknown>;
                if (typeof wordRecord.text !== 'string' || !wordRecord.text) continue;
                const wordStart = clamp(asFinite(wordRecord.start, start));
                words.push({
                    text: wordRecord.text,
                    start: wordStart,
                    end: clamp(asFinite(wordRecord.end, wordStart)),
                });
            }
        }

        const speakerId = formatSpeakerId(record.speaker);
        for (const word of words) {
            word.speakerId = speakerId;
        }

        segments.push({ speakerId, text: record.text.trim(), start, end, words });
    }

    return { languageCode, segments };
}

const TRANSCRIPTION_PROMPT = `Transcribe this audio precisely. Identify distinct speakers as SPEAKER_0, SPEAKER_1, etc.
Return ONLY valid JSON, no markdown fences, with this exact shape:
{"language": "<bcp47 or 'unknown'>", "segments": [{"speaker": "SPEAKER_0", "text": "...", "start": 0.0, "end": 1.2, "words": [{"text": "...", "start": 0.0, "end": 0.4}]}]}
Rules: start/end are seconds (float) into the audio. Every segment needs words with timestamps. Start a new segment when the speaker changes.`;

/** Native ASR returns speaker turns and protobuf duration strings instead of prompted JSON. */
export function parseNativeGeminiTranscript(transcriptions: Transcription[], durationSeconds?: number) {
    const seconds = (offset: string | undefined): number | undefined =>
        offset && /^\d+(?:\.\d+)?s$/.test(offset) ? Number(offset.slice(0, -1)) : undefined;
    return parseGeminiTranscript({
        language: transcriptions.find(part => part.languageCode)?.languageCode,
        segments: transcriptions.map(part => {
            const words = (part.words ?? []).map(word => ({
                text: word.word,
                start: seconds(word.startOffset),
                end: seconds(word.endOffset),
            }));
            return {
                speaker: part.speakerLabel,
                text: part.text || words.map(word => word.text).filter(Boolean).join(' '),
                start: words[0]?.start,
                end: words.at(-1)?.end ?? durationSeconds,
                words,
            };
        }),
    }, durationSeconds);
}

export class GeminiTranscriptionService implements ITranscriptionService {
    constructor() {
        if (!hasGeminiKey()) {
            logger.warn('GOOGLE_GENERATIVE_AI_API_KEY is not defined. Gemini transcription will fail.');
        }
    }

    async transcribe(fileUrl: string, options?: TranscribeOptions): Promise<TranscriptionResult> {
        const model = options?.model?.trim() || geminiModel('transcription');
        const durationSeconds = options?.durationSeconds;
        const nativeTranscription = model.replace(/^models\//, '') === 'gemini-3.5-transcribe';
        if (nativeTranscription && durationSeconds !== undefined && durationSeconds > 1800) {
            throw new Error('gemini-3.5-transcribe supports at most 30 minutes with speaker labels and word timestamps. Choose gemini-3.8-flash in GEMINI_MODEL_TRANSCRIPTION for longer recordings.');
        }
        const ai = getGeminiClient();

        // The Files API needs bytes, not a URL — download the (presigned) audio first.
        const audioResponse = await fetch(fileUrl);
        if (!audioResponse.ok) {
            throw new Error(`Failed to download audio for Gemini transcription: ${audioResponse.status}`);
        }
        const mimeType = audioResponse.headers.get('content-type')?.split(';')[0] || 'audio/mpeg';
        const blob = new Blob([Buffer.from(await audioResponse.arrayBuffer())], { type: mimeType });

        const uploaded = await ai.files.upload({ file: blob, config: { mimeType } });
        const fileName = uploaded.name;
        if (!fileName || !uploaded.uri) {
            throw new Error('Gemini file upload did not return a file reference');
        }

        try {
            let state = uploaded.state;
            for (let attempt = 0; attempt < 30 && state === 'PROCESSING'; attempt++) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
                state = (await ai.files.get({ name: fileName })).state;
            }
            if (state !== 'ACTIVE') {
                throw new Error(`Gemini file processing did not complete (state: ${state})`);
            }

            const response = await ai.models.generateContent({
                model,
                contents: [
                    { fileData: { fileUri: uploaded.uri, mimeType: uploaded.mimeType || mimeType } },
                    ...(nativeTranscription ? [] : [{ text: TRANSCRIPTION_PROMPT }]),
                ],
                config: nativeTranscription
                    ? { audioTranscriptionConfig: { mode: AudioTranscriptionConfigMode.VERBATIM, diarization: true, wordTimestamp: true } }
                    : { responseMimeType: 'application/json' },
            });

            let transcript: { languageCode: string; segments: TranscriptionSegment[] };
            let fallbackText = '';
            if (nativeTranscription) {
                const parts = response.candidates?.[0]?.content?.parts ?? [];
                transcript = parseNativeGeminiTranscript(
                    parts.flatMap(part => !part.thought && part.audioTranscription ? [part.audioTranscription] : []),
                    durationSeconds,
                );
                fallbackText = parts.filter(part => !part.thought).map(part => part.text ?? '').join('').trim();
            } else {
                const rawText = (response.text || '').trim().replace(/^```(?:json)?\n?|\n?```$/g, '');
                let parsed: unknown = null;
                try {
                    parsed = rawText ? (JSON.parse(rawText) as unknown) : null;
                } catch {
                    logger.warn('[Gemini] Transcription response was not valid JSON; using untimed fallback.');
                }
                transcript = parseGeminiTranscript(parsed, durationSeconds);
                fallbackText = typeof parsed === 'string' ? parsed : rawText;
            }

            const { languageCode, segments } = transcript;
            logger.info(`[Gemini] Processed ${segments.length} segments. Language: ${languageCode}`);

            const finalSegments =
                segments.length > 0
                    ? segments
                    : [
                          {
                              speakerId: 'Unknown',
                              text: fallbackText,
                              start: 0,
                              end: durationSeconds ?? 0,
                              words: [],
                          } satisfies TranscriptionSegment,
                      ];

            return {
                provider: 'gemini',
                model,
                text: finalSegments.map((s) => s.text).join(' '),
                languageCode,
                segments: finalSegments,
                transcriptionId: fileName,
            };
        } finally {
            // Always clean up the uploaded file; it would otherwise linger
            // (auto-expiry is 48h).
            try {
                await ai.files.delete({ name: fileName });
            } catch (error) {
                logger.warn('[Gemini] Failed to delete uploaded audio file:', error);
            }
        }
    }

    async deleteTranscript(_transcriptionId: string): Promise<void> {
        // Gemini retains no separate transcript resource. transcribe() owns
        // its temporary audio upload and deletes it in finally, on success
        // or failure. Job runners call this shared hook after saving results;
        // deleting the same upload again produces a misleading 403.
    }
}

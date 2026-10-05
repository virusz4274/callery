import type { TranscriptionSegment, TranscriptionWord } from '@/lib/db/types';

export interface ElevenLabsWebhookPayload {
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
        authSubject: string;
    };
    error?: string;
}

function formatSpeakerId(speakerId: string | undefined): string {
    if (!speakerId) {
        return 'Unknown';
    }

    return speakerId.replace('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

export function processElevenLabsWordsIntoSegments(
    words: ElevenLabsWebhookPayload['words']
): TranscriptionSegment[] {
    const segments: TranscriptionSegment[] = [];
    if (!words || words.length === 0) {
        return segments;
    }

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

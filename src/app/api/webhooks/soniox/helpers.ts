import type { TranscriptionSegment, TranscriptionWord } from '@/lib/db/types';
import type { SonioxPollWord } from '@/services/transcription/types';

export interface SonioxWebhookPayload {
    id: string;
    status: 'completed' | 'error';
}

function formatSpeakerId(speakerId: number | string | undefined): string {
    if (speakerId === undefined || speakerId === null) {
        return 'Unknown';
    }

    return `Speaker ${speakerId}`;
}

export function processSonioxWordsIntoSegments(words: SonioxPollWord[]): TranscriptionSegment[] {
    const segments: TranscriptionSegment[] = [];
    if (!words || words.length === 0) {
        return segments;
    }

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
            } satisfies TranscriptionSegment;
        }

        const mappedWord: TranscriptionWord = {
            text: word.text ?? '',
            start: (word.start_ms || 0) / 1000,
            end: (word.end_ms || 0) / 1000,
            speakerId: String(word.speaker),
            confidence: word.confidence ?? 0,
        };

        currentSegment.words.push(mappedWord);
        currentSegment.text += (currentSegment.text ? ' ' : '') + (word.text ?? '');
        currentSegment.end = (word.end_ms || 0) / 1000;
    }

    if (currentSegment) {
        segments.push(currentSegment);
    }

    return segments;
}

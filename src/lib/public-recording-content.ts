import 'server-only';
import type { Recording, TranscriptionSegment, TranscriptionWord } from './db/types';
import type { RecordingContentData } from './recording-content-types';
import { resolveShareClipBounds, type SharedClipBounds } from './sharing';

type RecordingSource = Pick<Recording,
    '_id' | 'duration' | 'mimeType' | 'transcriptionStatus' | 'transcriptionProvider' |
    'transcriptionModel' | 'fullTranscript' | 'summary'
>;
type PublicSegment = NonNullable<RecordingContentData['fullTranscript']>[number];
type Interval = { start: number; end: number };

function interval(start: number | undefined, end: number | undefined): Interval | null {
    return typeof start === 'number' && Number.isFinite(start) && start >= 0 &&
        typeof end === 'number' && Number.isFinite(end) && end > start ? { start, end } : null;
}

function contains(outer: Interval, inner: Interval): boolean {
    return inner.start >= outer.start && inner.end <= outer.end;
}

function publicSegment(segment: TranscriptionSegment): PublicSegment {
    return {
        speakerId: segment.speakerId,
        text: segment.text,
        start: segment.start,
        end: segment.end,
        transliteratedText: segment.transliteratedText,
    };
}

function clippedSegment(segment: TranscriptionSegment, clip: Interval): PublicSegment | null {
    const timing = interval(segment.start, segment.end);
    const words = Array.isArray(segment.words) ? segment.words : [];
    const coherentWords = timing && words.every(word => {
        const wordTiming = interval(word.start, word.end);
        return wordTiming && contains(timing, wordTiming);
    });
    if (timing && contains(clip, timing) && coherentWords) return publicSegment(segment);

    // Boundary segments cannot disclose their original text or transliteration.
    // Only independently timed, wholly contained words can reconstruct a clip.
    const retained: (TranscriptionWord & Interval)[] = [];
    for (const word of words) {
        const wordTiming = interval(word.start, word.end);
        if (wordTiming && contains(clip, wordTiming) && word.text.trim()) retained.push({ ...word, ...wordTiming });
    }
    if (!retained.length) return null;
    return {
        speakerId: segment.speakerId,
        text: retained.map(word => word.text.trim()).join(' '),
        start: retained.reduce((earliest, word) => Math.min(earliest, word.start), retained[0].start),
        end: retained.reduce((latest, word) => Math.max(latest, word.end), retained[0].end),
    };
}

/** Project before crossing the RSC/client boundary; browser filtering is not access control. */
export function toPublicRecordingContent(recording: RecordingSource, bounds: SharedClipBounds = {}): RecordingContentData {
    const clip = resolveShareClipBounds(bounds, recording.duration);
    const fullTranscript = recording.fullTranscript?.flatMap(segment => {
        const projected = clip ? clippedSegment(segment, clip) : publicSegment(segment);
        return projected ? [projected] : [];
    });
    return {
        id: recording._id.toString(),
        mimeType: recording.mimeType,
        transcriptionStatus: recording.transcriptionStatus,
        transcriptionProvider: recording.transcriptionProvider,
        transcriptionModel: recording.transcriptionModel,
        fullTranscript,
        // A full-call summary may disclose speech outside the shared interval.
        ...(!clip ? { summary: recording.summary } : {}),
    };
}

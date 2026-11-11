import type { RecordingContentData } from './recording-content-types';
import { validPlaybackTime } from './transcript-navigation';

type Segments = NonNullable<RecordingContentData['fullTranscript']>;

/** Export the permitted loaded transcript, independently of find/highlight state. */
export function transcriptPlainText(segments: Segments, transliterated = false): string {
    const speakers = Array.from(new Set(segments.map(segment => segment.speakerId).filter(Boolean)));
    return segments.flatMap(segment => {
        const text = transliterated ? segment.transliteratedText || segment.text : segment.text;
        if (!text.trim()) return [];
        const speaker = segment.speakerId ? `Speaker ${speakers.indexOf(segment.speakerId) + 1}` : 'Unknown speaker';
        const start = validPlaybackTime(segment.start);
        const seconds = start === undefined ? undefined : Math.floor(start);
        const timestamp = seconds === undefined ? '' : `[${Math.floor(seconds / 60).toString().padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}] `;
        return [`${timestamp}${speaker}\n${text}`];
    }).join('\n\n');
}

export function transcriptDownloadName(recordingId: string, transliterated = false): string {
    const id = recordingId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'recording';
    return `transcript-${id}${transliterated ? '-transliteration' : ''}.txt`;
}

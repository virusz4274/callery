export interface TimedTranscriptSegment {
    text: string;
    transliteratedText?: string;
    start?: number;
    end?: number;
}

export interface TranscriptTarget {
    segmentIndex?: number;
    start?: number;
    transcriptRevision?: string;
}

export interface TranscriptMatch { segmentIndex: number; start: number; end: number }

export function validPlaybackTime(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function activeTranscriptSegment(segments: TimedTranscriptSegment[], time: number, duration?: number): number {
    if (validPlaybackTime(time) === undefined) return -1;
    let active = -1;
    let latestStart = -1;
    const nextStarts: Array<number | undefined> = new Array(segments.length);
    let next = validPlaybackTime(duration);
    for (let index = segments.length - 1; index >= 0; index--) {
        nextStarts[index] = next;
        const start = validPlaybackTime(segments[index].start);
        if (start !== undefined) next = start;
    }
    for (let index = 0; index < segments.length; index++) {
        const start = validPlaybackTime(segments[index].start);
        if (start === undefined || start > time || start < latestStart) continue;
        const ownEnd = validPlaybackTime(segments[index].end);
        const nextStart = nextStarts[index] !== undefined && nextStarts[index]! > start ? nextStarts[index] : validPlaybackTime(duration);
        const end = ownEnd !== undefined && ownEnd > start ? ownEnd : nextStart ?? validPlaybackTime(duration);
        if (end !== undefined && time >= end) continue;
        active = index;
        latestStart = start;
    }
    return active;
}

export function findTranscriptMatches(segments: TimedTranscriptSegment[], query: string, transliterated = false): TranscriptMatch[] {
    const needle = query.trim();
    if (!needle) return [];
    const expression = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
    return segments.flatMap((segment, segmentIndex) => {
        const text = transliterated ? segment.transliteratedText || segment.text : segment.text;
        return Array.from(text.matchAll(expression), match => ({ segmentIndex, start: match.index, end: match.index + match[0].length }));
    });
}

export function playbackPositionKey(owner: string, recordingId: string): string {
    return `callery:playback:${encodeURIComponent(owner)}:${encodeURIComponent(recordingId)}`;
}

export function readPlaybackPosition(owner: string | undefined, recordingId: string): number {
    if (!owner || typeof window === 'undefined') return 0;
    try {
        const saved = JSON.parse(window.localStorage.getItem(playbackPositionKey(owner, recordingId)) || 'null');
        return validPlaybackTime(saved?.seconds) ?? 0;
    } catch { return 0; }
}

export function savePlaybackPosition(owner: string | undefined, recordingId: string, seconds: number): void {
    if (!owner || typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(playbackPositionKey(owner, recordingId), JSON.stringify({ seconds: validPlaybackTime(seconds) ?? 0 }));
    } catch { /* Playback remains usable when browser storage is unavailable. */ }
}

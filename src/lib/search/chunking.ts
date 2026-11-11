import type { TranscriptionSegment } from '@/lib/db/types';
import type { PassageSource, TranscriptPassage } from './types';

export const PASSAGE_LIMITS = { target: 384, maximum: 512, overlap: 64 } as const;
export type CountPassageInput = (text: string) => Promise<number>;
const utf8Count: CountPassageInput = async text => Buffer.byteLength(text, 'utf8');

function prefixWithinBytes(text: string, maximum: number): string {
    let bytes = 0, result = '';
    for (const character of text) {
        const length = Buffer.byteLength(character);
        if (bytes + length > maximum) break;
        bytes += length; result += character;
    }
    return result;
}

/** Complete Unicode-safe source coverage; source offsets survive overlap and packing. */
export async function chunkTranscript(segments: TranscriptionSegment[], counter?: CountPassageInput): Promise<TranscriptPassage[]> {
    const spans: { segmentIndex: number; from: number; to: number }[] = [];
    let source = '';
    segments.forEach((segment, segmentIndex) => {
        if (!segment.text.trim()) return;
        if (source) source += '\n';
        const from = source.length; source += segment.text; spans.push({ segmentIndex, from, to: source.length });
    });
    const cache = new Map<string, number>();
    const count: CountPassageInput = async text => {
        const saved = cache.get(text); if (saved !== undefined) return saved;
        const measured = await (counter ?? utf8Count)(text);
        if (!Number.isSafeInteger(measured) || measured < 0) throw new Error('The embedding tokenizer returned an invalid count.');
        cache.set(text, measured); return measured;
    };
    const passages: TranscriptPassage[] = [];
    let from = 0;
    while (from < source.length) {
        // This is a trial window only: every transmitted passage is measured below.
        let text = prefixWithinBytes(source.slice(from), counter ? 1536 : PASSAGE_LIMITS.target);
        if (!text) throw new Error('A transcript character exceeds the supported embedding input.');
        if (await count(text) > PASSAGE_LIMITS.target) {
            const characters = Array.from(text); let low = 1, high = characters.length, length = 0;
            while (low <= high) {
                const middle = Math.floor((low + high) / 2), candidate = characters.slice(0, middle).join('');
                if (await count(candidate) <= PASSAGE_LIMITS.target) { length = middle; low = middle + 1; } else high = middle - 1;
            }
            if (!length) throw new Error('A transcript character exceeds the supported embedding input.');
            text = characters.slice(0, length).join('');
        }
        let to = from + text.length;
        if (to < source.length) {
            const utterance = spans.filter(span => span.to > from + text.length * 0.65 && span.to <= to).at(-1);
            if (utterance) to = utterance.to;
            else {
                const boundary = text.search(/\s+\S*$/u);
                if (boundary > text.length * 0.65) to = from + boundary + 1;
            }
            text = source.slice(from, to);
        }
        const inputTokens = await count(text);
        if (inputTokens > PASSAGE_LIMITS.maximum) throw new Error('Passage exceeds the accepted embedding limit.');
        const sources: PassageSource[] = spans.filter(span => span.to > from && span.from < to).map(span => ({ segmentIndex: span.segmentIndex,
            from: Math.max(from, span.from) - span.from, to: Math.min(to, span.to) - span.from }));
        const starts = sources.flatMap(item => { const value = segments[item.segmentIndex].start; return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? [value] : []; });
        const ends = sources.flatMap(item => { const value = segments[item.segmentIndex].end; return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? [value] : []; });
        passages.push({ ordinal: passages.length, text, sources, inputTokens,
            ...(starts.length ? { start: Math.min(...starts) } : {}), ...(ends.length ? { end: Math.max(...ends) } : {}) });
        if (to === source.length) break;
        // Binary search over a bounded suffix, rather than one provider request per character.
        const characters = Array.from(text); let low = 0, high = Math.floor(characters.length / 2), overlapLength = 0;
        while (low <= high) {
            const middle = Math.floor((low + high) / 2), suffix = middle ? characters.slice(-middle).join('') : '';
            if (await count(suffix) <= PASSAGE_LIMITS.overlap) { overlapLength = middle; low = middle + 1; } else high = middle - 1;
        }
        const suffix = overlapLength ? characters.slice(-overlapLength).join('') : '';
        from = to - suffix.length;
    }
    return passages;
}

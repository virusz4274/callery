import { z } from 'zod';
import type { Recording } from '@/lib/db/types';
import type { SemanticSearchMatch } from '@/lib/search/types';
import { retrieveRecordings } from '@/lib/search/retrieval';
import { transcriptRevision } from '@/lib/transcription/ai-work-plan';
import { ApiError } from './contracts';
import { apiRecording, recordingResponse } from './recordings';
import { recordingAppUrl } from './recording-links';
import { requireScope, type ApiActor } from './tokens';

export const RecordingSearchSchema = z.object({
    query: z.string().trim().min(1).max(2000),
    page: z.number().int().min(1).max(100_000).default(1),
    pageSize: z.number().int().min(1).max(50).default(10),
    contactId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
    startDate: z.iso.date().optional(), endDate: z.iso.date().optional(),
}).strict().refine(input => !input.startDate || !input.endDate || input.startDate <= input.endDate,
    { message: 'The start date must precede the end date.', path: ['startDate'] });

export const TranscriptPageSchema = z.object({
    cursor: z.string().min(1).max(1024).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    revision: z.string().min(1).max(128).optional(),
}).strict();
const CursorSchema = z.object({ revision: z.string().min(1).max(128), segment: z.number().int().nonnegative(), offset: z.number().int().nonnegative() }).strict();
export const MAX_TRANSCRIPT_CHARACTERS = 16_000;

export function evidenceResponse(id: string, match: SemanticSearchMatch) {
    return { text: match.text, segmentIndex: match.segmentIndex, transcriptRevision: match.transcriptRevision,
        ...(match.start !== undefined ? { start: match.start } : {}), ...(match.end !== undefined ? { end: match.end } : {}),
        url: recordingAppUrl(id, match) };
}

/** Search remains personal even if the key has additional company permissions. */
export async function searchAccessibleRecordings(actor: ApiActor, raw: unknown) {
    requireScope(actor, 'recordings:read');
    const parsed = RecordingSearchSchema.safeParse(raw);
    if (!parsed.success) throw new ApiError(400, 'invalid_query', 'Enter a query of 1–2000 characters and valid contact/date/page filters.');
    const result = await retrieveRecordings(actor.token.owner, parsed.data);
    return { recordings: result.results.map(recording => ({ ...recordingResponse(recording), summary: recording.summary ?? null,
        matches: (result.matches[recording._id.toString()] || []).map(match => evidenceResponse(recording._id.toString(), match)) })),
        page: parsed.data.page, pageSize: parsed.data.pageSize, totalCount: result.totalCount, hasMore: result.hasMore,
        mode: result.mode, coverage: result.coverage,
        ...(result.resultLimit !== undefined ? { resultLimit: result.resultLimit } : {}),
        ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}) };
}

/** Bound both segment count and text. A large segment is continued by cursor. */
export function transcriptPage(recording: Recording, raw: unknown) {
    const parsed = TranscriptPageSchema.safeParse(raw);
    if (!parsed.success) throw new ApiError(400, 'invalid_query', 'Use a valid transcript cursor, revision, and limit of 1–100.');
    const { cursor, limit } = parsed.data;
    const segments = recording.fullTranscript || [];
    const revision = transcriptRevision(segments);
    let segment = 0, offset = 0;
    if (cursor) {
        try {
            const decoded = CursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
            if (decoded.revision !== revision) throw new ApiError(409, 'transcript_changed', 'The transcript changed. Start again without a cursor.');
            segment = decoded.segment; offset = decoded.offset;
        } catch (error) {
            if (error instanceof ApiError) throw error;
            throw new ApiError(400, 'invalid_cursor', 'The transcript cursor is invalid.');
        }
    }
    if (parsed.data.revision && parsed.data.revision !== revision) throw new ApiError(409, 'transcript_changed', 'The transcript changed. Refresh this recording.');
    if (segment > segments.length || (offset && (!segments[segment] || offset > segments[segment].text.length))) throw new ApiError(400, 'invalid_cursor', 'The transcript cursor is out of range.');
    const rows = []; let remaining = MAX_TRANSCRIPT_CHARACTERS;
    while (segment < segments.length && rows.length < limit && remaining > 0) {
        const source = segments[segment];
        let end = Math.min(source.text.length, offset + remaining);
        // Do not split a UTF-16 surrogate pair at a page boundary.
        if (end < source.text.length && end > offset && /[\uD800-\uDBFF]/.test(source.text[end - 1])) end--;
        if (end === offset && source.text.length > offset) break;
        rows.push({ segmentIndex: segment, from: offset, to: end, text: source.text.slice(offset, end), speakerId: source.speakerId,
            ...(source.start !== undefined ? { start: source.start } : {}), ...(source.end !== undefined ? { end: source.end } : {}),
            url: recordingAppUrl(recording._id.toString(), { segmentIndex: segment, start: source.start, transcriptRevision: revision }) });
        remaining -= end - offset;
        if (end < source.text.length) offset = end;
        else { segment++; offset = 0; }
    }
    return { recordingId: recording._id.toString(), url: recordingAppUrl(recording._id.toString()), revision,
        transcriptionStatus: recording.transcriptionStatus, totalSegments: segments.length, segments: rows,
        nextCursor: segment < segments.length ? Buffer.from(JSON.stringify({ revision, segment, offset })).toString('base64url') : null };
}

export async function readAccessibleTranscript(actor: ApiActor, id: string, raw: unknown) {
    return transcriptPage(await apiRecording(actor, id, 'read'), raw);
}

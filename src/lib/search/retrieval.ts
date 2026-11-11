import { ObjectId, type Filter } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { Recording } from '@/lib/db/types';
import { normalizeEndDate } from '@/lib/db/recordings/query-utils';
import { getSearchEmbedding, type SearchEmbeddingFallback } from '@/services/ai/search-embedding';
import { hydrateRecordingContacts } from '@/lib/db/recordings/hydrate-contacts';
import { embeddingProfile } from './profile';
import { inspectSearchReadiness } from './readiness';
import { PASSAGES_COLLECTION, PASSAGE_VECTOR_INDEX, type RecordingPassage } from './passages';
import type { EmbeddingProfile, SearchCoverage, SemanticSearchInput, SemanticSearchMatch } from './types';

export type SemanticSearchMode = 'vector' | 'fallback';
export type SemanticFallbackReason = SearchEmbeddingFallback | 'vector_unavailable';
export type RankedRecording = Recording & { searchScore: number };
export interface RetrievalResult {
    results: RankedRecording[]; matches: Record<string, SemanticSearchMatch[]>; coverage: SearchCoverage;
    totalCount: number; hasMore: boolean; mode: SemanticSearchMode; fallbackReason?: SemanticFallbackReason;
    /** Meaning-based ranking uses a bounded candidate window; keyword fallback does not. */
    resultLimit?: number;
}
const RANKING_WINDOW = 200;
const RECORDING_PROJECTION = { _id: 1, authSubject: 1, contactId: 1, contactName: 1, phoneNumber: 1, r2Key: 1,
    fileName: 1, standardizedDisplayName: 1, fileSize: 1, mimeType: 1, duration: 1, recordedAt: 1, createdAt: 1, updatedAt: 1,
    transcriptionStatus: 1, summary: 1, tags: 1, isStarred: 1, isArchived: 1, searchIndex: 1,
    'fullTranscript.text': 1, 'fullTranscript.start': 1, 'fullTranscript.end': 1, 'fullTranscript.speakerId': 1 };
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function patterns(query: string): string[] {
    return [...new Set([query.trim(), ...query.trim().split(/\s+/).filter(term => term.length >= 3)].filter(Boolean).map(escapeRegex))];
}
export function recordingSearchFilter(owner: string, input: Pick<SemanticSearchInput, 'contactId' | 'startDate' | 'endDate'>): Filter<Recording> {
    const filter: Filter<Recording> = { authSubject: owner, isArchived: { $ne: true } };
    if (input.contactId) {
        if (!ObjectId.isValid(input.contactId)) throw new Error('Invalid contact filter.');
        filter.contactId = new ObjectId(input.contactId);
    }
    if (input.startDate || input.endDate) {
        const dates: { $gte?: Date; $lte?: Date } = {};
        if (input.startDate) { dates.$gte = new Date(input.startDate); if (!Number.isFinite(dates.$gte.getTime())) throw new Error('Invalid start date.'); }
        if (input.endDate) { const end = normalizeEndDate(input.endDate); if (!end) throw new Error('Invalid end date.'); dates.$lte = end; }
        if (dates.$gte && dates.$lte && dates.$gte > dates.$lte) throw new Error('The start date must precede the end date.');
        filter.recordedAt = dates;
    }
    return filter;
}
/** Reciprocal-rank fusion preserves both exact retrieval and paraphrase matches. */
export function fuseRecordingRanks(lexicalIds: string[], vectorIds: string[]): { id: string; score: number }[] {
    const scores = new Map<string, number>();
    for (const ranking of [lexicalIds, vectorIds]) {
        const unique = [...new Set(ranking)];
        unique.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (60 + rank + 1)));
    }
    return [...scores].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
function sourceMatch(recording: Recording, query: string): SemanticSearchMatch[] {
    const terms = patterns(query);
    const index = recording.fullTranscript?.findIndex(segment => terms.some(term => new RegExp(term, 'iu').test(segment.text))) ?? -1;
    if (index < 0) return [];
    const segment = recording.fullTranscript![index];
    const match: SemanticSearchMatch = { text: segment.text.slice(0, 600), segmentIndex: index,
        transcriptRevision: recording.searchIndex?.transcriptRevision ?? '' };
    if (typeof segment.start === 'number' && Number.isFinite(segment.start) && segment.start >= 0) match.start = segment.start;
    if (typeof segment.end === 'number' && Number.isFinite(segment.end) && segment.end >= 0) match.end = segment.end;
    return [match];
}

export async function retrieveRecordings(owner: string, input: SemanticSearchInput): Promise<RetrievalResult> {
    const db = await getMongoDb(), filter = recordingSearchFilter(owner, input);
    const page = Math.max(1, Math.min(100_000, Math.floor(input.page ?? 1))), pageSize = Math.max(1, Math.min(50, Math.floor(input.pageSize ?? 10)));
    const terms = patterns(input.query), fields = ['summary', 'contactName', 'phoneNumber', 'fileName', 'standardizedDisplayName', 'tags', 'fullTranscript.text'];
    const lexicalFilter = { ...filter, $or: terms.flatMap(term => fields.map(field => ({ [field]: { $regex: term, $options: 'i' } }))) };
    const recordings = db.collection<Recording>(Collections.RECORDINGS);
    let profile: EmbeddingProfile | undefined;
    try { profile = embeddingProfile(); } catch { /* Ordinary keyword retrieval remains available. */ }
    let lexical: Recording[] = [];
    const coverageRows = await recordings.aggregate<{ _id: { state: string; profileId: string }; count: number }>([
        { $match: { ...filter, 'fullTranscript.0': { $exists: true } } },
        { $group: { _id: { state: { $ifNull: ['$searchIndex.state', 'pending'] }, profileId: '$searchIndex.profileId' }, count: { $sum: 1 } } },
    ]).toArray();
    const coverage: SearchCoverage = { ready: 0, pending: 0, failed: 0, total: 0 };
    for (const row of coverageRows) { coverage.total += row.count; if (row._id.state === 'ready' && row._id.profileId === profile?.id) coverage.ready += row.count; else if (row._id.state === 'failed') coverage.failed += row.count; else coverage.pending += row.count; }
    let mode: SemanticSearchMode = 'vector', fallbackReason: SemanticFallbackReason | undefined;
    let vectorPassages: (RecordingPassage & { searchScore: number })[] = [];
    try {
        if (!profile) throw new Error('Search embedding profile is unavailable.');
        if (!(await inspectSearchReadiness(db)).ready) throw new Error('The passage vector index is unavailable.');
        const generated = await getSearchEmbedding(owner, input.query, profile);
        if (!generated.embedding.length) { mode = 'fallback'; fallbackReason = generated.fallbackReason ?? 'embedding_unavailable'; }
        else {
            const vectorFilter: Record<string, unknown> = { owner, profileId: profile.id, isArchived: false, published: true };
            if (input.contactId) vectorFilter.contactId = input.contactId;
            if (filter.recordedAt) vectorFilter.recordedAt = filter.recordedAt;
            [lexical, vectorPassages] = await Promise.all([
                recordings.find(lexicalFilter, { projection: RECORDING_PROJECTION }).sort({ recordedAt: -1, _id: -1 }).limit(RANKING_WINDOW).toArray(),
                db.collection<RecordingPassage>(PASSAGES_COLLECTION).aggregate<RecordingPassage & { searchScore: number }>([
                    { $vectorSearch: { index: PASSAGE_VECTOR_INDEX, path: 'vector', queryVector: generated.embedding, numCandidates: 2000, limit: RANKING_WINDOW, filter: vectorFilter } },
                    { $project: { vector: 0, response: 0 } },
                    { $set: { searchScore: { $meta: 'vectorSearchScore' } } },
                ]).toArray(),
            ]);
            // Search indexes are eventually consistent; the live recording is the authorization/publication boundary.
            const ids = [...new Set(vectorPassages.map(row => row.recordingId))].filter(ObjectId.isValid);
            const current = ids.length ? await recordings.find({ ...filter, _id: { $in: ids.map(id => new ObjectId(id)) }, 'searchIndex.state': 'ready', 'searchIndex.profileId': profile.id }, { projection: RECORDING_PROJECTION }).toArray() : [];
            const currentById = new Map(current.map(recording => [recording._id.toString(), recording]));
            vectorPassages = vectorPassages.filter(row => {
                const recording = currentById.get(row.recordingId);
                return recording?.searchIndex?.generation === row.generation && recording.searchIndex.transcriptRevision === row.transcriptRevision;
            });
            for (const recording of current) if (!lexical.some(item => item._id.equals(recording._id))) lexical.push(recording);
        }
    } catch { mode = 'fallback'; fallbackReason = 'vector_unavailable'; }
    if (mode === 'fallback') {
        const skip = (page - 1) * pageSize;
        const [rows, totalCount] = await Promise.all([
            recordings.find(lexicalFilter, { projection: RECORDING_PROJECTION }).sort({ recordedAt: -1, _id: -1 }).skip(skip).limit(pageSize).toArray(),
            recordings.countDocuments(lexicalFilter),
        ]);
        const selected = rows.map((recording, index) => ({ ...recording, searchScore: 1 / (61 + skip + index) }));
        const matches = Object.fromEntries(selected.map(recording => [recording._id.toString(), sourceMatch(recording, input.query)]));
        return { results: await hydrateRecordingContacts(owner, selected), matches, coverage, totalCount,
            hasMore: totalCount > skip + rows.length, mode, fallbackReason };
    }
    const vectorIds = vectorPassages.map(passage => passage.recordingId);
    // Added vector records are kept for hydration only, not given an artificial lexical rank.
    const lexicalIds = lexical.filter(recording => fields.some(field => {
        if (field === 'fullTranscript.text') return recording.fullTranscript?.some(segment => terms.some(term => new RegExp(term, 'iu').test(segment.text)));
        const value = recording[field as keyof Recording]; return terms.some(term => new RegExp(term, 'iu').test(Array.isArray(value) ? value.join(' ') : String(value ?? '')));
    })).map(recording => recording._id.toString());
    const ranking = fuseRecordingRanks(lexicalIds, vectorIds).slice(0, RANKING_WINDOW);
    const pageRows = ranking.slice((page - 1) * pageSize, page * pageSize);
    const byId = new Map(lexical.map(recording => [recording._id.toString(), recording]));
    const selected = pageRows.flatMap(row => { const recording = byId.get(row.id); return recording ? [{ ...recording, searchScore: row.score }] : []; });
    const matches: Record<string, SemanticSearchMatch[]> = {};
    for (const recording of selected) {
        const id = recording._id.toString();
        matches[id] = vectorPassages.filter(passage => passage.recordingId === id).slice(0, 3).map(passage => ({ text: passage.text, segmentIndex: passage.sources[0].segmentIndex,
            transcriptRevision: passage.transcriptRevision, ...(passage.start !== undefined ? { start: passage.start } : {}), ...(passage.end !== undefined ? { end: passage.end } : {}) }));
        if (!matches[id].length) matches[id] = sourceMatch(recording, input.query);
    }
    return { results: await hydrateRecordingContacts(owner, selected), matches, coverage, totalCount: ranking.length,
        hasMore: ranking.length > page * pageSize, mode, resultLimit: RANKING_WINDOW };
}

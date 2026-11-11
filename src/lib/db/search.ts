import { normalizeEndDate } from './recordings';
import { ObjectId } from 'mongodb';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { Recording } from '@/lib/db/types';
import { hydrateRecordingContacts } from './recordings/hydrate-contacts';
import { retrieveRecordings, fuseRecordingRanks, type RankedRecording } from '@/lib/search/retrieval';
import type { SemanticSearchInput } from '@/lib/search/types';
export type { SemanticFallbackReason, SemanticSearchMode } from '@/lib/search/retrieval';

const SEARCH_RESULT_PROJECTION = {
    _id: 1, authSubject: 1, contactId: 1, contactName: 1, phoneNumber: 1, r2Key: 1,
    fileName: 1, standardizedDisplayName: 1, fileSize: 1, mimeType: 1, duration: 1,
    recordedAt: 1, createdAt: 1, updatedAt: 1, transcriptionStatus: 1, summary: 1,
    tags: 1, isStarred: 1, isArchived: 1, searchIndex: 1,
} as const;
export type SearchResult = RankedRecording;

export function mergeSearchResults(keywordResults: SearchResult[], vectorResults: SearchResult[]): SearchResult[] {
    const rows = new Map([...keywordResults, ...vectorResults].map(recording => [recording._id.toString(), recording]));
    return fuseRecordingRanks(keywordResults.map(row => row._id.toString()), vectorResults.map(row => row._id.toString()))
        .map(row => ({ ...rows.get(row.id)!, searchScore: row.score }));
}

export async function searchRecordingsByVector(query: string, authSubject: string, page = 1, pageSize = 10,
    filters: Pick<SemanticSearchInput, 'contactId' | 'startDate' | 'endDate'> = {}) {
    return retrieveRecordings(authSubject, { query, page, pageSize, ...filters });
}

export interface PaginatedSearchResult {
    results: SearchResult[];
    totalCount: number;
}

export interface AtlasSearchOptions {
    needsTranscription?: boolean;
    contactId?: string;
    limit?: number;
    skip?: number;
    includeArchived?: boolean;
    contactName?: string;
    sortBy?: 'date' | 'duration' | 'relevance';
    sortOrder?: 'asc' | 'desc';
    startDate?: string;
    endDate?: string;
}

/** Atlas Search index name for keyword/full-text search (see init.ts). */
export const RECORDINGS_TEXT_SEARCH_INDEX = 'recordings_text_search';
export { PASSAGE_VECTOR_INDEX as RECORDINGS_VECTOR_SEARCH_INDEX } from '@/lib/search/passages';


export async function searchRecordingsByAtlas(
    query: string,
    authSubject: string,
    options?: AtlasSearchOptions
): Promise<PaginatedSearchResult> {
    const db = await getMongoDb();
    const limit = Math.min(Math.max(1, options?.limit ?? 20), 100);
    const skip = Math.max(0, options?.skip ?? 0);

    // Paths must stay within the deployed `recordings_text_search` mapping
    // (see init.ts). Phone-number queries bypass Atlas via the API route.
    const textPaths = [
        'summary',
        'contactName',
        'fileName',
        'standardizedDisplayName',
        'tags',
        'fullTranscript.text',
    ];

    const filter: Record<string, unknown>[] = [
        { text: { query: authSubject, path: 'authSubject' } },
    ];

    if (options?.contactName && options.contactName !== 'Unknown') {
        filter.push({ text: { query: options.contactName, path: 'contactName' } });
    }

    const searchStage = {
        $search: {
            index: RECORDINGS_TEXT_SEARCH_INDEX,
            compound: {
                must: [
                    {
                        text: {
                            query,
                            path: textPaths,
                            fuzzy: { maxEdits: 1 },
                        },
                    },
                ],
                filter,
            },
        },
    };

    // Post-search match for filters not covered by the search index.
    const match: Record<string, unknown> = { authSubject };
    if (options?.needsTranscription) match.transcriptionStatus = { $ne: 'completed' };
    if (options?.contactId) match.contactId = new ObjectId(options.contactId);
    if (!options?.includeArchived) {
        match.isArchived = { $ne: true };
    }
    if (options?.contactName === 'Unknown') {
        match.contactName = null;
    } else if (options?.contactName) {
        match.contactName = options.contactName;
    }
    if (options?.startDate || options?.endDate) {
        const dateQuery: Record<string, unknown> = {};
        if (options.startDate) {
            const start = new Date(options.startDate);
            if (!isNaN(start.getTime())) dateQuery.$gte = start;
        }
        if (options.endDate) {
            const end = normalizeEndDate(options.endDate);
            if (end) dateQuery.$lte = end;
        }
        if (Object.keys(dateQuery).length > 0) {
            match.recordedAt = dateQuery;
        }
    }

    const sortStage: Record<string, unknown> = {};
    if (options?.sortBy === 'duration') {
        sortStage.$sort = { duration: options.sortOrder === 'asc' ? 1 : -1 };
    } else if (options?.sortBy === 'date') {
        sortStage.$sort = { recordedAt: options.sortOrder === 'asc' ? 1 : -1 };
    }
    // Default relevance order: no $sort stage (Atlas returns by score).

    const basePipeline: Record<string, unknown>[] = [searchStage];
    if (Object.keys(match).length > 0) basePipeline.push({ $match: match });

    const resultsPipeline = [...basePipeline];
    if (sortStage.$sort) resultsPipeline.push(sortStage);
    resultsPipeline.push({ $skip: skip }, { $limit: limit });
    resultsPipeline.push({
        $project: { ...SEARCH_RESULT_PROJECTION, searchScore: { $meta: 'searchScore' } },
    });

    const countPipeline = [...basePipeline, { $count: 'total' }];

    const [results, countDocs] = await Promise.all([
        db.collection<Recording>(Collections.RECORDINGS).aggregate(resultsPipeline).toArray(),
        db.collection(Collections.RECORDINGS).aggregate(countPipeline).toArray(),
    ]);

    return {
        results: await hydrateRecordingContacts(authSubject, results as SearchResult[]),
        totalCount: (countDocs[0]?.total as number) ?? 0,
    };
}

/** True when an error means Atlas Search itself is unavailable/misconfigured. */
export function isAtlasUnavailableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
        /Unrecognized pipeline stage name: '\$search'/i.test(message) ||
        /index .* not found/i.test(message) ||
        /search index/i.test(message) ||
        /\$search/i.test(message)
    );
}

import { normalizeEndDate } from './recordings';
import { ObjectId } from 'mongodb';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { getAiService } from '@/services/ai';
import { Recording } from '@/lib/db/types';
import { logger } from '@/lib/logger';
import { hydrateRecordingContacts } from './recordings/hydrate-contacts';


const VECTOR_SEARCH_INDEX = 'recordings_vector_search';
const KEYWORD_MATCH_SCORE = 2;

const SEARCH_RESULT_PROJECTION = {
    _id: 1,
    authSubject: 1,
    contactId: 1,
    contactName: 1,
    phoneNumber: 1,
    r2Key: 1,
    fileName: 1,
    standardizedDisplayName: 1,
    fileSize: 1,
    mimeType: 1,
    duration: 1,
    recordedAt: 1,
    createdAt: 1,
    updatedAt: 1,
    transcriptionStatus: 1,
    summary: 1,
    tags: 1,
    isStarred: 1,
    isArchived: 1,
} as const;

export interface SearchResult extends Recording {
    searchScore: number;
}

export type SemanticSearchMode = 'vector' | 'fallback';
export type SemanticFallbackReason = 'embedding_unavailable' | 'vector_unavailable';

function escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildKeywordPatterns(query: string): string[] {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
        return [];
    }

    const termPatterns = trimmedQuery
        .split(/\s+/)
        .map((part) => part.trim())
        .filter((part) => part.length >= 3);

    return [...new Set([trimmedQuery, ...termPatterns].map(escapeRegex))];
}

function buildKeywordSearchQuery(query: string, authSubject: string): Record<string, unknown> {
    const patterns = buildKeywordPatterns(query);

    if (patterns.length === 0) {
        return {
            authSubject,
            isArchived: { $ne: true },
            _id: { $exists: false },
        };
    }

    const searchableFields = ['summary', 'contactName', 'phoneNumber', 'fileName', 'standardizedDisplayName', 'tags', 'fullTranscript.text'];

    return {
        authSubject,
        isArchived: { $ne: true },
        $or: patterns.flatMap((pattern) =>
            searchableFields.map((field) => ({
                [field]: { $regex: pattern, $options: 'i' },
            }))
        ),
    };
}

async function searchRecordingsByKeyword(
    query: string,
    authSubject: string,
    windowLimit: number
): Promise<{ results: SearchResult[]; totalCount: number }> {
    const db = await getMongoDb();
    const keywordQuery = buildKeywordSearchQuery(query, authSubject);
    const totalCount = await db.collection<Recording>(Collections.RECORDINGS).countDocuments(keywordQuery);

    if (totalCount === 0 || windowLimit <= 0) {
        return { results: [], totalCount };
    }

    const results = await db
        .collection<Recording>(Collections.RECORDINGS)
        .find(keywordQuery, { projection: SEARCH_RESULT_PROJECTION })
        .sort({ recordedAt: -1 })
        .limit(windowLimit)
        .toArray();

    return {
        results: results.map((recording) => ({
            ...recording,
            searchScore: KEYWORD_MATCH_SCORE,
        })),
        totalCount,
    };
}

export function mergeSearchResults(keywordResults: SearchResult[], vectorResults: SearchResult[]): SearchResult[] {
    const merged = new Map<string, SearchResult>();

    for (const result of vectorResults) {
        merged.set(result._id.toString(), result);
    }

    for (const result of keywordResults) {
        const key = result._id.toString();
        if (!merged.has(key)) {
            merged.set(key, result);
        }
    }

    return [...merged.values()];
}

/**
 * Semantic search for recordings using Vector Search with keyword fallback.
 */
export async function searchRecordingsByVector(
    query: string,
    authSubject: string,
    page: number = 1,
    pageSize: number = 10
): Promise<{
    results: SearchResult[];
    totalCount: number;
    hasMore: boolean;
    mode: SemanticSearchMode;
    fallbackReason?: SemanticFallbackReason;
}> {
    if (!query) return { results: [], totalCount: 0, hasMore: false, mode: 'vector' };

    try {
        const db = await getMongoDb();
        const safePage = Math.max(1, page);
        const safePageSize = Math.max(1, pageSize);
        const pageWindow = safePage * safePageSize;
        const pageStart = (safePage - 1) * safePageSize;

        const keywordSearch = await searchRecordingsByKeyword(query, authSubject, pageWindow + 1);
        const queryEmbedding = await getAiService().generateEmbedding(query);
        let vectorResults: SearchResult[] = [];
        let mode: SemanticSearchMode = 'vector';
        let fallbackReason: SemanticFallbackReason | undefined;

        if (!queryEmbedding || queryEmbedding.length === 0) {
            logger.warn('Empty embedding generated for query, falling back to keyword search:', query);
            mode = 'fallback';
            fallbackReason = 'embedding_unavailable';
        } else {
            try {
                const vectorWindow = Math.max(pageWindow * 3, 25);
                const numCandidates = Math.max(100, vectorWindow * 10);
                const aggregation = [
                    {
                        $vectorSearch: {
                            index: VECTOR_SEARCH_INDEX,
                            path: 'summaryEmbedding',
                            queryVector: queryEmbedding,
                            numCandidates,
                            limit: vectorWindow,
                            filter: {
                                $and: [
                                    { authSubject: { $eq: authSubject } },
                                    { isArchived: { $ne: true } },
                                ],
                            },
                        },
                    },
                    {
                        $project: {
                            ...SEARCH_RESULT_PROJECTION,
                            searchScore: { $meta: 'vectorSearchScore' },
                        },
                    },
                ];

                vectorResults = await db
                    .collection<Recording>(Collections.RECORDINGS)
                    .aggregate<SearchResult>(aggregation)
                    .toArray();
            } catch (error) {
                logger.error('Vector search unavailable, returning keyword results only:', error);
                mode = 'fallback';
                fallbackReason = 'vector_unavailable';
            }
        }

        const mergedResults = mergeSearchResults(keywordSearch.results, vectorResults);
        if (mergedResults.length === 0) {
            return { results: [], totalCount: 0, hasMore: false, mode, fallbackReason };
        }

        return {
            results: await hydrateRecordingContacts(authSubject, mergedResults.slice(pageStart, pageStart + safePageSize)),
            totalCount: Math.max(keywordSearch.totalCount, mergedResults.length),
            hasMore: mergedResults.length > pageWindow || keywordSearch.totalCount > pageWindow,
            mode,
            fallbackReason,
        };
    } catch (error) {
        logger.error('Vector search error:', error);
        throw new Error('Failed to perform vector search');
    }
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
export const RECORDINGS_VECTOR_SEARCH_INDEX = 'recordings_vector_search';


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

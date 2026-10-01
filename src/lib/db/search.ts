import { getMongoDb, Collections } from '@/lib/mongodb';
import { getAiService } from '@/services/ai';
import { Recording } from '@/lib/db/types';
import { normalizeEndDate } from '@/lib/db/recordings';

const aiService = getAiService();

export interface SearchResult extends Recording {
    searchScore: number;
}

export interface PaginatedSearchResult {
    results: SearchResult[];
    totalCount: number;
}

export interface AtlasSearchOptions {
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

// Cached stored-vector width. Embedding models each emit a fixed dimension;
// switching models (or AI providers) without re-embedding breaks vector
// search, so the first search per process learns the stored width and every
// search after that fails fast with an actionable error on mismatch.
let knownStoredDims: number | undefined;

async function assertEmbeddingDimsMatch(
    db: Awaited<ReturnType<typeof getMongoDb>>,
    queryDims: number,
): Promise<void> {
    if (knownStoredDims === undefined) {
        const sample = await db
            .collection<Recording>(Collections.RECORDINGS)
            .findOne(
                { summaryEmbedding: { $exists: true, $ne: [] } },
                { projection: { summaryEmbedding: 1 } },
            );
        if (!sample?.summaryEmbedding?.length) return; // nothing stored yet — nothing to compare
        knownStoredDims = sample.summaryEmbedding.length;
    }
    if (queryDims !== knownStoredDims) {
        throw new Error(
            `Embedding dimension mismatch: query has ${queryDims} dims but stored vectors have ${knownStoredDims}. ` +
                'The embedding model changed — restore the previous model or re-embed existing recordings.',
        );
    }
}

const SEARCH_PROJECT = {
    _id: 1,
    authSubject: 1,
    contactId: 1,
    contactName: 1,
    phoneNumber: 1,
    r2Key: 1,
    fileName: 1,
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
};

/**
 * Semantic search for recordings using Vector Search.
 *
 * `$vectorSearch` has no native skip, so pagination is implemented by
 * over-fetching (`skip + limit + 1`) and slicing. `totalCount` is exact
 * when the window reaches the end of the result set; otherwise it reports
 * `skip + page.length + 1` as an "at least" count so callers can offer a
 * next page (same convention as Atlas `$search` examples for search-after).
 */
export async function searchRecordingsByVector(
    query: string,
    authSubject: string,
    limit: number = 20,
    skip: number = 0
): Promise<PaginatedSearchResult> {
    if (!query) return { results: [], totalCount: 0 };

    try {
        const db = await getMongoDb();
        const queryEmbedding = await aiService.generateEmbedding(query, { authSubject });

        if (!queryEmbedding || queryEmbedding.length === 0) {
            console.warn('Empty embedding generated for query:', query);
            return { results: [], totalCount: 0 };
        }

        await assertEmbeddingDimsMatch(db, queryEmbedding.length);

        const safeSkip = Math.max(0, skip);
        const safeLimit = Math.min(Math.max(1, limit), 100);
        const fetchLimit = safeSkip + safeLimit + 1;

        const aggregation = [
            {
                $vectorSearch: {
                    index: RECORDINGS_VECTOR_SEARCH_INDEX,
                    path: 'summaryEmbedding',
                    queryVector: queryEmbedding,
                    numCandidates: Math.max(100, fetchLimit * 10),
                    limit: fetchLimit,
                    filter: {
                        authSubject: {
                            $eq: authSubject
                        }
                    }
                }
            },
            {
                $project: {
                    ...SEARCH_PROJECT,
                    searchScore: { $meta: 'vectorSearchScore' }
                }
            }
        ];

        const fetched = await db
            .collection<Recording>(Collections.RECORDINGS)
            .aggregate(aggregation)
            .toArray() as SearchResult[];

        const hasMore = fetched.length > safeSkip + safeLimit;
        const results = fetched.slice(safeSkip, safeSkip + safeLimit);
        const totalCount = hasMore ? safeSkip + results.length + 1 : safeSkip + results.length;

        return { results, totalCount };
    } catch (error) {
        console.error('Vector search error:', error);
        throw new Error('Failed to perform vector search');
    }
}

/**
 * Keyword search for recordings using Atlas Search (`$search`).
 *
 * Filters (owner, archived, contact, date range) are applied inside the
 * `$search` compound filter where indexed, with a `$match` stage covering
 * the rest. Returns the page plus an exact total via `$count`.
 *
 * Throws when Atlas Search is unavailable (self-hosted MongoDB, missing
 * index) so callers can fall back to the regex query path.
 */
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
    const match: Record<string, unknown> = {};
    if (!options?.includeArchived) {
        match.isArchived = { $ne: true };
    }
    if (options?.contactName === 'Unknown') {
        match.contactName = null;
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
        $project: { ...SEARCH_PROJECT, searchScore: { $meta: 'searchScore' } },
    });

    const countPipeline = [...basePipeline, { $count: 'total' }];

    const [results, countDocs] = await Promise.all([
        db.collection<Recording>(Collections.RECORDINGS).aggregate(resultsPipeline).toArray(),
        db.collection(Collections.RECORDINGS).aggregate(countPipeline).toArray(),
    ]);

    return {
        results: results as SearchResult[],
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

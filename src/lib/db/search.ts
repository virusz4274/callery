import { getMongoDb, Collections } from '@/lib/mongodb';
import { GeminiService } from '@/services/ai/gemini-service';
import { Recording } from '@/lib/db/types';

const aiService = new GeminiService();
const VECTOR_SEARCH_INDEX = 'recordings_vector_search';
const KEYWORD_MATCH_SCORE = 2;

const SEARCH_RESULT_PROJECTION = {
    _id: 1,
    firebaseUid: 1,
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

function buildKeywordSearchQuery(query: string, firebaseUid: string): Record<string, unknown> {
    const patterns = buildKeywordPatterns(query);

    if (patterns.length === 0) {
        return {
            firebaseUid,
            isArchived: { $ne: true },
            _id: { $exists: false },
        };
    }

    const searchableFields = ['summary', 'contactName', 'phoneNumber', 'fileName', 'fullTranscript.text'];

    return {
        firebaseUid,
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
    firebaseUid: string,
    windowLimit: number
): Promise<{ results: SearchResult[]; totalCount: number }> {
    const db = await getMongoDb();
    const keywordQuery = buildKeywordSearchQuery(query, firebaseUid);
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

function mergeSearchResults(keywordResults: SearchResult[], vectorResults: SearchResult[]): SearchResult[] {
    const merged = new Map<string, SearchResult>();

    for (const result of keywordResults) {
        merged.set(result._id.toString(), result);
    }

    for (const result of vectorResults) {
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
    firebaseUid: string,
    page: number = 1,
    pageSize: number = 10
): Promise<{
    results: SearchResult[];
    totalCount: number;
    mode: SemanticSearchMode;
    fallbackReason?: SemanticFallbackReason;
}> {
    if (!query) return { results: [], totalCount: 0, mode: 'vector' };

    try {
        const db = await getMongoDb();
        const safePage = Math.max(1, page);
        const safePageSize = Math.max(1, pageSize);
        const pageWindow = safePage * safePageSize;
        const pageStart = (safePage - 1) * safePageSize;

        const keywordSearch = await searchRecordingsByKeyword(query, firebaseUid, pageWindow);
        const queryEmbedding = await aiService.generateEmbedding(query);
        let vectorResults: SearchResult[] = [];
        let mode: SemanticSearchMode = 'vector';
        let fallbackReason: SemanticFallbackReason | undefined;

        if (!queryEmbedding || queryEmbedding.length === 0) {
            console.warn('Empty embedding generated for query, falling back to keyword search:', query);
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
                                firebaseUid: { $eq: firebaseUid },
                            },
                        },
                    },
                    {
                        $match: {
                            isArchived: { $ne: true },
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
                console.error('Vector search unavailable, returning keyword results only:', error);
                mode = 'fallback';
                fallbackReason = 'vector_unavailable';
            }
        }

        const mergedResults = mergeSearchResults(keywordSearch.results, vectorResults);
        if (mergedResults.length === 0) {
            return { results: [], totalCount: 0, mode, fallbackReason };
        }

        return {
            results: mergedResults.slice(pageStart, pageStart + safePageSize),
            totalCount: Math.max(keywordSearch.totalCount, mergedResults.length),
            mode,
            fallbackReason,
        };
    } catch (error) {
        console.error('Vector search error:', error);
        throw new Error('Failed to perform vector search');
    }
}

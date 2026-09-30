import { getMongoDb, Collections } from '@/lib/mongodb';
import { getAiService } from '@/services/ai';
import { Recording } from '@/lib/db/types';

const aiService = getAiService();

export interface SearchResult extends Recording {
    searchScore: number;
}

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

/**
 * Semantic search for recordings using Vector Search
 */
export async function searchRecordingsByVector(
    query: string,
    authSubject: string,
    limit: number = 20
): Promise<SearchResult[]> {
    if (!query) return [];

    try {
        const db = await getMongoDb();
        const queryEmbedding = await aiService.generateEmbedding(query, { authSubject });

        if (!queryEmbedding || queryEmbedding.length === 0) {
            console.warn('Empty embedding generated for query:', query);
            return [];
        }

        await assertEmbeddingDimsMatch(db, queryEmbedding.length);

        const aggregation = [
            {
                $vectorSearch: {
                    index: 'recordings_vector_search',
                    path: 'summaryEmbedding',
                    queryVector: queryEmbedding,
                    numCandidates: 100, // Number of nearest neighbors to examine
                    limit: limit, // Number of results to return
                    filter: {
                        authSubject: {
                            $eq: authSubject
                        }
                    }
                }
            },
            {
                $project: {
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
                    searchScore: { $meta: 'vectorSearchScore' }
                }
            }
        ];

        const results = await db
            .collection<Recording>(Collections.RECORDINGS)
            .aggregate(aggregation)
            .toArray();

        return results as SearchResult[];
    } catch (error) {
        console.error('Vector search error:', error);
        throw new Error('Failed to perform vector search');
    }
}

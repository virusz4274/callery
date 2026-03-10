import { getMongoDb, Collections } from '@/lib/mongodb';
import { GeminiService } from '@/services/ai/gemini-service';
import { Recording } from '@/lib/db/types';

const aiService = new GeminiService();

export interface SearchResult extends Recording {
    searchScore: number;
}

/**
 * Semantic search for recordings using Vector Search
 */
export async function searchRecordingsByVector(
    query: string,
    firebaseUid: string,
    page: number = 1,
    pageSize: number = 10
): Promise<{ results: SearchResult[]; totalCount: number }> {
    if (!query) return { results: [], totalCount: 0 };

    try {
        const db = await getMongoDb();
        const safePage = Math.max(1, page);
        const safePageSize = Math.max(1, pageSize);
        const queryEmbedding = await aiService.generateEmbedding(query);

        if (!queryEmbedding || queryEmbedding.length === 0) {
            console.warn('Empty embedding generated for query:', query);
            return { results: [], totalCount: 0 };
        }

        // Vector search does nearest-neighbor ranking across searchable docs.
        // We compute an explicit searchable pool count so totalCount is stable and page-independent.
        const totalCount = await db.collection<Recording>(Collections.RECORDINGS).countDocuments({
            firebaseUid,
            isArchived: false,
            summaryEmbedding: { $exists: true, $ne: [] },
        });

        if (totalCount === 0) {
            return { results: [], totalCount: 0 };
        }

        const searchLimit = Math.min(totalCount, safePage * safePageSize);
        if (searchLimit <= 0) {
            return { results: [], totalCount };
        }

        const numCandidates = Math.max(100, searchLimit * 10);

        const aggregation = [
            {
                $vectorSearch: {
                    index: 'recordings_vector_search',
                    path: 'summaryEmbedding',
                    queryVector: queryEmbedding,
                    numCandidates: numCandidates,
                    limit: searchLimit, // Fetch enough to cover up to current page
                    filter: {
                        firebaseUid: { $eq: firebaseUid },
                        isArchived: { $eq: false },
                    }
                }
            },
            {
                $project: {
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
                    searchScore: { $meta: 'vectorSearchScore' }
                }
            },
            { $skip: (safePage - 1) * safePageSize },
            { $limit: safePageSize }
        ];

        const results = await db
            .collection<Recording>(Collections.RECORDINGS)
            .aggregate(aggregation)
            .toArray();

        return { results: results as SearchResult[], totalCount };
    } catch (error) {
        console.error('Vector search error:', error);
        throw new Error('Failed to perform vector search');
    }
}

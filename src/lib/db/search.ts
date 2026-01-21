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
    limit: number = 20
): Promise<SearchResult[]> {
    if (!query) return [];

    try {
        const db = await getMongoDb();
        const queryEmbedding = await aiService.generateEmbedding(query);

        if (!queryEmbedding || queryEmbedding.length === 0) {
            console.warn('Empty embedding generated for query:', query);
            return [];
        }

        const aggregation = [
            {
                $vectorSearch: {
                    index: 'recordings_vector_search',
                    path: 'summaryEmbedding',
                    queryVector: queryEmbedding,
                    numCandidates: 100, // Number of nearest neighbors to examine
                    limit: limit, // Number of results to return
                    filter: {
                        firebaseUid: {
                            $eq: firebaseUid
                        }
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

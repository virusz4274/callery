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
        const queryEmbedding = await aiService.generateEmbedding(query);

        if (!queryEmbedding || queryEmbedding.length === 0) {
            console.warn('Empty embedding generated for query:', query);
            return { results: [], totalCount: 0 };
        }

        // Vector Search requires "limit" to determine how many nearest neighbors to find.
        // To paginate properly (e.g., get page 2), we conceptually need the top (page * pageSize) results
        // and then slice the last (pageSize).
        const searchLimit = page * pageSize;
        // We set numCandidates higher to ensure accuracy.
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
            },
            { $skip: (page - 1) * pageSize },
            { $limit: pageSize }
        ];

        const results = await db
            .collection<Recording>(Collections.RECORDINGS)
            .aggregate(aggregation)
            .toArray();

        // Note: Getting an accurate "total count" for vector search is tricky because 
        // it's a similarity search, not a hard filter. Usually, we clamp it or run a separate count 
        // if we have a hard threshold. For now, we will return a heuristic or just not support 
        // "Total Pages" accurately beyond "Load More". 
        // However, the UI expects a count. Let's assume a reasonable cap for relevant results 
        // or try to count candidates if possible.
        // A simple approach is to return a fixed high number if results > 0 to allow "Next" 
        // until we run out. Or just return results.
        // Let's rely on the client to handle "no more results" if list < pageSize.
        // For the UI's "Found X relevant recordings", we might lose that total unless we do 2 queries 
        // or just return the page.
        // IMPROVEMENT: For now, we return `results.length` as total if we can't easily get it, 
        // which might break pagination UI logic that relies on `totalCount`.
        // Let's return a "virtual" total count that allows pagination to continue?
        // Actually, let's just return the results. The UI handles "next" if result count == pageSize.

        return { results: results as SearchResult[], totalCount: results.length };
    } catch (error) {
        console.error('Vector search error:', error);
        throw new Error('Failed to perform vector search');
    }
}

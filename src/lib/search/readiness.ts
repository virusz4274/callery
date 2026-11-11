import type { Db } from 'mongodb';
import { embeddingProfile } from './profile';
import { PASSAGES_COLLECTION, PASSAGE_VECTOR_INDEX } from './passages';

const FILTER_PATHS = ['owner', 'profileId', 'contactId', 'recordedAt', 'isArchived', 'published'];

export function passageVectorIndexDefinition(dimensions: number) {
    return { fields: [
        { type: 'vector', path: 'vector', numDimensions: dimensions, similarity: 'cosine' },
        ...FILTER_PATHS.map(path => ({ type: 'filter', path })),
    ] };
}

/** Configuration/readiness only: this does not submit a paid embedding request. */
export async function inspectSearchReadiness(db: Db): Promise<{ ready: boolean; message: string }> {
    try {
        const profile = embeddingProfile();
        const indexes = await db.collection(PASSAGES_COLLECTION).listSearchIndexes(PASSAGE_VECTOR_INDEX).toArray();
        const index = indexes[0] as { queryable?: boolean; latestDefinition?: { fields?: {
            type?: string; path?: string; numDimensions?: number; similarity?: string;
        }[] } } | undefined;
        const definition = index?.latestDefinition;
        const vector = definition?.fields?.find(field => field.path === 'vector');
        const missingFilters = FILTER_PATHS.filter(path => !definition?.fields?.some(field => field.path === path && field.type === 'filter'));
        if (!index || index.queryable !== true || vector?.type !== 'vector' || vector.numDimensions !== profile.dimensions ||
            vector.similarity !== 'cosine' || missingFilters.length) return { ready: false,
            message: `Create a queryable ${PASSAGE_VECTOR_INDEX} index on ${PASSAGES_COLLECTION} with a cosine vector field of ${profile.dimensions} dimensions and filter fields for ${FILTER_PATHS.join(', ')}. Keyword search remains available.` };
        return { ready: true, message: 'Passage vector index is queryable and matches the configured dimensions, cosine similarity and required scope filters.' };
    } catch {
        return { ready: false, message: 'Semantic search requires search-enabled MongoDB and the configured passage index. Keyword search remains available.' };
    }
}

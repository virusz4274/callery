'use server';

import { logger } from '@/lib/logger';

import { searchRecordingsByVector, type SemanticFallbackReason, type SemanticSearchMode } from '@/lib/db/search';
import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { RecordingResponse } from '@/lib/db/types';
import { toRecordingResponse } from '@/lib/db/converters';

export interface SearchResponse {
    success: boolean;
    results: RecordingResponse[];
    totalCount?: number;
    hasMore?: boolean;
    mode?: SemanticSearchMode;
    fallbackReason?: SemanticFallbackReason;
    error?: string;
}

export async function searchRecordingsAction(query: string, page: number = 1, pageSize: number = 10): Promise<SearchResponse> {
    try {
        const uid = await getAuthSubjectFromSession();
        if (!uid) {
            return { success: false, results: [], error: 'Unauthorized' };
        }

        const { results: searchResults, totalCount, hasMore, mode, fallbackReason } = await searchRecordingsByVector(query, uid, page, pageSize);

        const formattedResults: RecordingResponse[] = searchResults.map((recording) => toRecordingResponse(recording));

        return { success: true, results: formattedResults, totalCount, hasMore, mode, fallbackReason };
    } catch (error) {
        logger.error('Search action error:', error);
        return { success: false, results: [], error: 'Search failed' };
    }
}

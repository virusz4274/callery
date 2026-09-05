import { logger } from '@/lib/logger';
'use server';

import { searchRecordingsByVector, type SemanticFallbackReason, type SemanticSearchMode } from '@/lib/db/search';
import { getFirebaseUidFromSession } from '@/lib/auth-utils';
import { RecordingResponse } from '@/lib/db/types';
import { toRecordingResponse } from '@/lib/db/converters';

export interface SearchResponse {
    success: boolean;
    results: RecordingResponse[];
    totalCount?: number;
    mode?: SemanticSearchMode;
    fallbackReason?: SemanticFallbackReason;
    error?: string;
}

export async function searchRecordingsAction(query: string, page: number = 1, pageSize: number = 10): Promise<SearchResponse> {
    try {
        const uid = await getFirebaseUidFromSession();
        if (!uid) {
            return { success: false, results: [], error: 'Unauthorized' };
        }

        const { results: searchResults, totalCount, mode, fallbackReason } = await searchRecordingsByVector(query, uid, page, pageSize);

        const formattedResults: RecordingResponse[] = searchResults.map((recording) => toRecordingResponse(recording));

        return { success: true, results: formattedResults, totalCount, mode, fallbackReason };
    } catch (error) {
        logger.error('Search action error:', error);
        return { success: false, results: [], error: 'Search failed' };
    }
}

'use server';

import { z } from 'zod';
import { logger } from '@/lib/logger';
import { searchRecordingsByVector, type SemanticFallbackReason, type SemanticSearchMode } from '@/lib/db/search';
import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import type { RecordingResponse } from '@/lib/db/types';
import { toRecordingResponse } from '@/lib/db/converters';
import type { SearchCoverage, SemanticSearchInput, SemanticSearchMatch } from '@/lib/search/types';

export interface SearchResponse {
    success: boolean;
    results: RecordingResponse[];
    matches?: Record<string, SemanticSearchMatch[]>;
    coverage?: SearchCoverage;
    totalCount?: number;
    hasMore?: boolean;
    resultLimit?: number;
    mode?: SemanticSearchMode;
    fallbackReason?: SemanticFallbackReason;
    error?: string;
}
const SearchInput = z.object({ query: z.string().trim().min(1).max(2000), page: z.number().int().min(1).max(100_000).default(1),
    pageSize: z.number().int().min(1).max(50).default(10), contactId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
    startDate: z.iso.date().optional(), endDate: z.iso.date().optional() }).strict();

export async function searchRecordingsAction(input: SemanticSearchInput): Promise<SearchResponse> {
    try {
        const uid = await getAuthSubjectFromSession();
        if (!uid) return { success: false, results: [], error: 'Unauthorized' };
        const parsed = SearchInput.safeParse(input);
        if (!parsed.success) return { success: false, results: [], error: 'Enter a search phrase and valid filters.' };
        const { query, page, pageSize, ...filters } = parsed.data;
        const result = await searchRecordingsByVector(query, uid, page, pageSize, filters);
        return { success: true, ...result, results: result.results.map(recording => {
            const response = toRecordingResponse(recording);
            delete response.fullTranscript;
            return response;
        }) };
    } catch (error) {
        logger.error('Search action error:', error);
        return { success: false, results: [], error: 'Search failed. Check the search configuration or try again.' };
    }
}

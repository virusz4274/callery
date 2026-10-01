'use server';

import { searchRecordingsByVector } from '@/lib/db/search';
import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { RecordingResponse } from '@/lib/db/types';

export interface SearchResponse {
    success: boolean;
    results: RecordingResponse[];
    totalCount: number;
    page: number;
    limit: number;
    error?: string;
}

export async function searchRecordingsAction(
    query: string,
    page: number = 1,
    limit: number = 10
): Promise<SearchResponse> {
    const safePage = Math.max(1, Math.floor(page) || 1);
    const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 10), 100);
    try {
        const uid = await getAuthSubjectFromSession();
        if (!uid) {
            return { success: false, results: [], totalCount: 0, page: safePage, limit: safeLimit, error: 'Unauthorized' };
        }

        const trimmed = query.trim();
        if (!trimmed) {
            return { success: false, results: [], totalCount: 0, page: safePage, limit: safeLimit, error: 'Empty query' };
        }

        const { results: searchResults, totalCount } = await searchRecordingsByVector(
            trimmed,
            uid,
            safeLimit,
            (safePage - 1) * safeLimit
        );

        // Convert to response type (serialize dates/IDs)
        const formattedResults: RecordingResponse[] = searchResults.map(rec => ({
            id: rec._id.toString(),
            authSubject: rec.authSubject,
            contactId: rec.contactId?.toString() || null,
            contactName: rec.contactName,
            phoneNumber: rec.phoneNumber,
            r2Key: rec.r2Key,
            fileName: rec.fileName,
            fileSize: rec.fileSize,
            mimeType: rec.mimeType,
            duration: rec.duration,
            recordedAt: rec.recordedAt.toISOString(),
            createdAt: rec.createdAt.toISOString(),
            updatedAt: rec.updatedAt.toISOString(),
            transcriptionStatus: rec.transcriptionStatus,
            fullTranscript: rec.fullTranscript,
            languageCode: rec.languageCode,
            summary: rec.summary,
            tags: rec.tags,
            isStarred: rec.isStarred,
            isArchived: rec.isArchived,
            // Add search score if you want to display match confidence in UI?
            // For now keeping it compatible with RecordingResponse
        }));

        return { success: true, results: formattedResults, totalCount, page: safePage, limit: safeLimit };
    } catch (error) {
        console.error('Search action error:', error);
        return { success: false, results: [], totalCount: 0, page: safePage, limit: safeLimit, error: 'Search failed' };
    }
}

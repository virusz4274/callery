'use server';

import { searchRecordingsByVector, type SemanticFallbackReason, type SemanticSearchMode } from '@/lib/db/search';
import { getFirebaseUidFromSession } from '@/lib/auth-utils';
import { RecordingResponse } from '@/lib/db/types';

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

        // Convert to response type (serialize dates/IDs)
        const formattedResults: RecordingResponse[] = searchResults.map(rec => ({
            id: rec._id.toString(),
            firebaseUid: rec.firebaseUid,
            contactId: rec.contactId?.toString() || null,
            contactName: rec.contactName,
            phoneNumber: rec.phoneNumber,
            r2Key: rec.r2Key,
            fileName: rec.fileName,
            standardizedDisplayName: rec.standardizedDisplayName,
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

        return { success: true, results: formattedResults, totalCount, mode, fallbackReason };
    } catch (error) {
        console.error('Search action error:', error);
        return { success: false, results: [], error: 'Search failed' };
    }
}

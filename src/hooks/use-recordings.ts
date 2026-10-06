'use client';

import useSWR from 'swr';
import type { RecordingResponse } from '@/lib/db/types';
import { getRecordingsAction, deleteRecordingAction, updateRecordingAction, GetRecordingsOptions } from '@/app/actions/recordings';

interface UseRecordingsResult {
    data: RecordingResponse[] | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
    totalCount: number;
}

/**
 * Hook to fetch recordings for the current user.
 * Uses Server Actions with SWR for caching and revalidation.
 */
export function useRecordings(
    options?: GetRecordingsOptions
): UseRecordingsResult {
    // Unique key for SWR cache based on options
    const key = ['recordings', options] as const;

    const { data: responseData, error, isLoading, mutate } = useSWR(key, async ([, opts]: [string, GetRecordingsOptions | undefined]) => {
        const response = await getRecordingsAction(opts);

        if (response.error) {
            throw new Error(response.error);
        }

        return response;
    }, {
        // SWR Configuration
        revalidateOnFocus: false,
        dedupingInterval: 5000,
    });

    return {
        data: responseData?.recordings || null,
        isLoading,
        error: error || null,
        refetch: async () => { await mutate(); },
        totalCount: responseData?.totalCount || 0,
    };
}

/**
 * Delete a recording.
 */
export async function deleteRecordingApi(recordingId: string): Promise<{ success: boolean; error?: string }> {
    return deleteRecordingAction(recordingId);
}

/**
 * Update a recording.
 */
export async function updateRecordingApi(
    recordingId: string,
    data: { isStarred?: boolean; isArchived?: boolean; tags?: string[] }
): Promise<{ success: boolean; error?: string }> {
    return updateRecordingAction(recordingId, data);
}

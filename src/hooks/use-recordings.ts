'use client';

import { useState, useEffect, useCallback } from 'react';
import type { RecordingResponse } from '@/lib/db/types';
import { authFetch } from '@/lib/api-client';

interface UseRecordingsResult {
    data: RecordingResponse[] | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
    totalCount: number;
}

/**
 * Hook to fetch recordings for the current user.
 * Uses the API route which handles authentication via session cookie.
 */
export function useRecordings(
    options?: {
        limit?: number;
        skip?: number;
        includeArchived?: boolean;
    }
): UseRecordingsResult {
    const [data, setData] = useState<RecordingResponse[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [totalCount, setTotalCount] = useState(0);

    const fetchRecordings = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams();
            if (options?.limit) params.set('limit', options.limit.toString());
            if (options?.skip) params.set('skip', options.skip.toString());
            if (options?.includeArchived) params.set('includeArchived', 'true');

            const response = await authFetch(`/api/recordings?${params.toString()}`);

            // Check content type before parsing JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                // Not JSON - likely a redirect or error page
                if (response.status === 401 || response.status === 302) {
                    // User not authenticated
                    setData(null);
                    setTotalCount(0);
                    return;
                }
                throw new Error(`Unexpected response type: ${contentType}`);
            }

            if (!response.ok) {
                if (response.status === 401) {
                    // User not authenticated
                    setData(null);
                    setTotalCount(0);
                    return;
                }
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch recordings');
            }

            const result = await response.json();
            setData(result.recordings);
            setTotalCount(result.totalCount);
        } catch (err) {
            console.error('Error fetching recordings:', err);
            setError(err instanceof Error ? err : new Error('Unknown error'));
            setData(null);
        } finally {
            setIsLoading(false);
        }
    }, [options?.limit, options?.skip, options?.includeArchived]);

    useEffect(() => {
        fetchRecordings();
    }, [fetchRecordings]);

    return {
        data,
        isLoading,
        error,
        refetch: fetchRecordings,
        totalCount,
    };
}

/**
 * Delete a recording.
 */
export async function deleteRecordingApi(recordingId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const response = await authFetch(`/api/recordings/${recordingId}`, {
            method: 'DELETE',
        });

        // Check content type
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            return { success: false, error: 'Server error' };
        }

        if (!response.ok) {
            const data = await response.json();
            return { success: false, error: data.error || 'Failed to delete recording' };
        }

        return { success: true };
    } catch (error) {
        console.error('Error deleting recording:', error);
        return { success: false, error: 'Network error' };
    }
}

/**
 * Update a recording.
 */
export async function updateRecordingApi(
    recordingId: string,
    data: { isStarred?: boolean; isArchived?: boolean; tags?: string[] }
): Promise<{ success: boolean; error?: string }> {
    try {
        const response = await authFetch(`/api/recordings/${recordingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        // Check content type
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            return { success: false, error: 'Server error' };
        }

        if (!response.ok) {
            const result = await response.json();
            return { success: false, error: result.error || 'Failed to update recording' };
        }

        return { success: true };
    } catch (error) {
        console.error('Error updating recording:', error);
        return { success: false, error: 'Network error' };
    }
}

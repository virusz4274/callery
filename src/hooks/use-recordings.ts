'use client';

import useSWR from 'swr';
import type { RecordingResponse } from '@/lib/db/types';
import { authFetch } from '@/lib/api-client';

interface UseRecordingsResult {
    data: RecordingResponse[] | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
    totalCount: number;
    totalPages: number;
    page: number;
}

interface RecordingOptions {
    limit?: number;
    /** 1-based page. Prefer over `skip`; when both are given, page wins. */
    page?: number;
    /** @deprecated Use `page` instead. Kept for backwards compatibility. */
    skip?: number;
    includeArchived?: boolean;
    contactName?: string;
    sortBy?: 'date' | 'duration';
    sortOrder?: 'asc' | 'desc';
    startDate?: string;
    endDate?: string;
    /** Keyword search across contact, phone, file, summary, tags, transcript. */
    search?: string;
}

/**
 * Hook to fetch recordings for the current user.
 * Uses the API route which handles authentication via session cookie.
 */
export function useRecordings(
    options?: RecordingOptions
): UseRecordingsResult {
    // Unique key for SWR cache based on options
    const key = ['/api/recordings', options] as const;

    const { data: responseData, error, isLoading, mutate } = useSWR(key, async ([url, opts]: [string, RecordingOptions | undefined]) => {
        const params = new URLSearchParams();
        if (opts?.limit) params.set('limit', opts.limit.toString());
        if (opts?.page) {
            params.set('page', opts.page.toString());
        } else if (opts?.skip) {
            params.set('skip', opts.skip.toString());
        }
        if (opts?.includeArchived) params.set('includeArchived', 'true');
        if (opts?.contactName) params.set('contactName', opts.contactName);
        if (opts?.sortBy) params.set('sortBy', opts.sortBy);
        if (opts?.sortOrder) params.set('sortOrder', opts.sortOrder);
        if (opts?.startDate) params.set('startDate', opts.startDate);
        if (opts?.endDate) params.set('endDate', opts.endDate);
        if (opts?.search?.trim()) params.set('search', opts.search.trim());

        const response = await authFetch(`${url}?${params.toString()}`);

        // Check content type before parsing JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            if (response.status === 401 || response.status === 302) {
                // Return empty structure for unauthorized/redirects to handle gracefully
                return { recordings: [], totalCount: 0 };
            }
            throw new Error(`Unexpected response type: ${contentType}`);
        }

        if (!response.ok) {
            if (response.status === 401) return { recordings: [], totalCount: 0 };
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch recordings');
        }

        return response.json();
    }, {
        // SWR Configuration
        revalidateOnFocus: false, // Don't reval on window focus to save bandwidth
        dedupingInterval: 5000, // Dedup requests within 5s
        keepPreviousData: true, // Keep showing the old page while the new one loads
    });

    const limit = options?.limit || 20;
    const totalCount = responseData?.totalCount || 0;

    return {
        data: responseData?.recordings || null,
        isLoading,
        error: error || null,
        refetch: async () => { await mutate(); },
        totalCount,
        totalPages: responseData?.totalPages ?? Math.ceil(totalCount / limit),
        page: responseData?.page ?? options?.page ?? 1,
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

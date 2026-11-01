'use client';

import useSWRInfinite from 'swr/infinite';
import { authFetchJson } from '@/lib/api-client';
import type { BatchResponse, TranscriptionWorkspace, WaitingRecording } from '@/lib/transcription/batch-types';
import { useUser } from '@/lib/auth/client';

export type { BatchResponse as TranscriptionBatch, WaitingRecording as WaitingTranscriptionRecording } from '@/lib/transcription/batch-types';

export type BatchMutation = {
    action: 'edit' | 'remove' | 'start' | 'pause' | 'resume' | 'retry';
    recordingIds?: string[];
    name?: string;
    provider?: string;
    model?: string;
    acknowledgeProviderOutcome?: boolean;
};

export function useTranscriptionWorkspace(enabled: boolean) {
    const { user } = useUser();
    const result = useSWRInfinite<TranscriptionWorkspace>(
        (index, previous: TranscriptionWorkspace | null) => {
            if (!enabled || !user) return null;
            if (index === 0) return ['transcription-workspace', user.id, '/api/transcription/workspace'] as const;
            if (!previous?.waitingNextCursor && !previous?.batchesNextCursor) return null;
            const params = new URLSearchParams();
            params.set('waitingAfter', previous.waitingNextCursor || 'end');
            params.set('batchesAfter', previous.batchesNextCursor || 'end');
            return ['transcription-workspace', user.id, `/api/transcription/workspace?${params}`] as const;
        },
        ([, , url]: readonly [string, string, string]) => authFetchJson<TranscriptionWorkspace>(url),
        {
            revalidateAll: true,
            refreshInterval: (pages) => pages?.some(page => page.batches.some(batch => batch.status === 'running' || batch.recordings.some(recording => recording.jobState === 'running' || recording.jobState === 'submitted'))) ? 5000 : 0,
        },
    );

    const waiting = new Map<string, WaitingRecording>();
    const batches = new Map<string, BatchResponse>();
    for (const page of result.data ?? []) {
        for (const recording of page.waiting) if (!waiting.has(recording.id)) waiting.set(recording.id, recording);
        for (const batch of page.batches) if (!batches.has(batch.id)) batches.set(batch.id, batch);
    }
    const lastPage = result.data?.at(-1);

    return {
        ...result,
        waiting: [...waiting.values()],
        batches: [...batches.values()],
        providers: result.data?.[0]?.providers ?? [],
        waitingTotal: result.data?.[0]?.waitingTotal ?? waiting.size,
        batchesTotal: result.data?.[0]?.batchesTotal ?? batches.size,
        hasMore: Boolean(lastPage?.waitingNextCursor || lastPage?.batchesNextCursor),
        loadMore: () => result.setSize(result.size + 1),
    };
}

export function mutateTranscriptionBatch(id: string, mutation: BatchMutation) {
    return authFetchJson<{ batch?: BatchResponse }>(`/api/transcription/batches/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mutation),
    });
}

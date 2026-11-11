import type { RecordingResponse } from './db/types';

export function recordingNeedsRefresh(recording: Pick<RecordingResponse, 'transcriptionStatus' | 'processingProgress' | 'processingStatus'> | undefined): boolean {
    if (!recording) return false;
    if (recording.processingStatus?.code === 'enrichment_queued') return true;
    const state = recording.processingStatus?.state;
    if (state && ['failed', 'blocked', 'needs_review'].includes(state)) return false;
    return recording.transcriptionStatus === 'processing' || state === 'running' ||
        Boolean(recording.processingProgress?.transcriptAvailable && ['pending', 'running'].includes(recording.processingProgress.enrichmentState));
}

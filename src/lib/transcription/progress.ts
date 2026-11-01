import type { ProcessingStatus } from './processing-errors';

export interface ProcessingProgress {
    transcriptAvailable: boolean;
    enrichmentState: 'not_started' | 'pending' | 'running' | 'blocked' | 'failed' | 'needs_review' | 'completed';
}

/** A presentation projection, not another stored processing state machine. */
export function processingProgress(recording: {
    transcriptionStatus: string; fullTranscript?: unknown[]; transcriptionEnrichmentPending?: boolean;
    processingStatus?: ProcessingStatus;
}): ProcessingProgress {
    const stage = recording.processingStatus?.stage;
    const transcriptAvailable = Array.isArray(recording.fullTranscript) || Boolean(recording.transcriptionEnrichmentPending)
        || recording.transcriptionStatus === 'completed' || Boolean(stage && stage !== 'transcription');
    if (recording.processingStatus?.code === 'enrichment_queued') return { transcriptAvailable: true, enrichmentState: 'pending' };
    if (!transcriptAvailable) return { transcriptAvailable: false, enrichmentState: 'not_started' };
    // Retranscription may retain an earlier usable transcript while ASR runs or
    // fails. Its existence alone does not mean the new job reached enrichment.
    if (stage === 'transcription') return { transcriptAvailable: true, enrichmentState: 'not_started' };
    if (recording.transcriptionStatus === 'completed' && !recording.transcriptionEnrichmentPending) return { transcriptAvailable: true, enrichmentState: 'completed' };
    if (stage && stage !== 'completed') return { transcriptAvailable: true, enrichmentState: recording.processingStatus!.state };
    return { transcriptAvailable: true, enrichmentState: recording.transcriptionStatus === 'processing' ? 'running' : 'pending' };
}

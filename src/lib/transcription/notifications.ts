import { getRecordingById } from '@/lib/db/recordings';
import { findUserByAuthSubject } from '@/lib/db/users';
import { createNotification } from '@/lib/notifications';
import { buildRecordingNotificationLink } from '@/lib/notification-links';
import { logger } from '@/lib/logger';

/** Insert once per accepted result/outcome. Push is best effort after insertion. */
export async function notifyProcessingOutcome(owner: string, recordingId: string, outcome: 'completed' | 'partial' | 'failed', attemptId?: string): Promise<void> {
    try {
        const recording = await getRecordingById(recordingId, owner);
        if (!recording) return;
        if (attemptId && recording.transcriptionAttemptId && recording.transcriptionAttemptId !== attemptId) return;
        if (outcome === 'completed' && (recording.transcriptionStatus !== 'completed' || recording.transcriptionEnrichmentPending)) return;
        if (outcome === 'partial' && (!recording.fullTranscript || !recording.transcriptionEnrichmentPending)) return;
        if (outcome === 'failed' && (recording.transcriptionStatus !== 'failed' || recording.transcriptionEnrichmentPending)) return;
        const identity = outcome === 'failed' ? attemptId || recording.transcriptionAttemptId || recording.externalTranscriptionId
            : recording.transcriptionResultAttemptId || recording.transcriptionReceipt?.id || recording.externalTranscriptionId || attemptId;
        if (!identity) return;
        const user = await findUserByAuthSubject(owner);
        if (!user || user.softDelete?.isDeleted) return;
        const text = outcome === 'completed' ? { type: 'success' as const, title: 'Transcription Ready', message: `Your recording "${recording.standardizedDisplayName}" is ready.` }
            : outcome === 'partial' ? { type: 'warning' as const, title: 'Transcript Saved', message: `The transcript for "${recording.standardizedDisplayName}" is saved. AI enrichment needs attention.` }
                : { type: 'error' as const, title: 'Transcription Failed', message: `Processing failed for "${recording.standardizedDisplayName}".` };
        await createNotification(user._id, text.type, text.title, text.message, buildRecordingNotificationLink(recordingId),
            { eventKey: `processing:${recordingId}:${identity}:${outcome}` });
    } catch (error) { logger.error('Processing result saved; notification delivery failed:', error); }
}

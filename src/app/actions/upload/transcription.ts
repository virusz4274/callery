import { findUserByAuthSubject } from '@/lib/db/users';
import { getRecordingById, updateRecording } from '@/lib/db/recordings';
import { getTeamSettings } from '@/lib/team-policy';
import { createNotification } from '@/lib/notifications';
import { startManualTranscription } from '@/lib/transcription/manual';

export type AutoTranscriptionResult = { outcome: 'skipped' | 'queued' | 'started_async' | 'completed' };

export async function markAutoTranscriptionFailed(authSubject: string, recordingId: string, displayName: string, errorMessage?: string) {
    await updateRecording(recordingId, authSubject, { transcriptionStatus: 'failed', transcriptionError: errorMessage });
    const user = await findUserByAuthSubject(authSubject);
    if (user) await createNotification(user._id, 'error', 'Transcription Failed', `Processing failed for "${displayName}".${errorMessage ? ` ${errorMessage}` : ''}`);
}

/** Legacy callers also enter the durable dispatcher; they cannot launch a parallel pipeline. */
export async function startAutoTranscriptionForRecording(authSubject: string, recordingId: string): Promise<AutoTranscriptionResult> {
    const [user, recording, team] = await Promise.all([
        findUserByAuthSubject(authSubject), getRecordingById(recordingId, authSubject), getTeamSettings(),
    ]);
    if (!user || !recording || recording.bulkImportId || user.disabled || user.softDelete?.isDeleted || user.teamInvitationPending ||
        ['processing', 'completed'].includes(recording.transcriptionStatus) ||
        (team.enabled ? team.transcriptionMode !== 'automatic' : !user.transcriptionSettings.autoTranscribe)) return { outcome: 'skipped' };
    const result = await startManualTranscription(authSubject, recordingId, {
        provider: team.enabled ? team.transcriptionProvider : user.transcriptionSettings.defaultProvider,
        model: team.enabled ? team.transcriptionModel : user.transcriptionSettings.defaultModel,
    });
    if (result.error) throw new Error(result.error);
    return { outcome: 'queued' };
}

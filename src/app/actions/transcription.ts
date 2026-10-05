'use server';
import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { startManualTranscription, type ManualTranscriptionOptions } from '@/lib/transcription/manual';

export async function transcribeRecordingAction(recordingId: string, options?: ManualTranscriptionOptions) {
    const subject = await getAuthSubjectFromSession();
    if (!subject) return { error: 'Unauthorized' };
    return startManualTranscription(subject, recordingId, options);
}

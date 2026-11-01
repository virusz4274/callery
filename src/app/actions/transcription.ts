'use server';
import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { startManualTranscription, type ManualTranscriptionOptions } from '@/lib/transcription/manual';
import { after } from 'next/server';
import { processTranscriptionJobs } from '@/lib/integrations/jobs';

export async function transcribeRecordingAction(recordingId: string, options?: ManualTranscriptionOptions) {
    const subject = await getAuthSubjectFromSession();
    if (!subject) return { error: 'Unauthorized' };
    const result = await startManualTranscription(subject, recordingId, options);
    if (result.success) after(async () => { await processTranscriptionJobs(); });
    return result;
}

import {
    createAsyncJob,
    findActiveAsyncJob,
} from '@/lib/db/async-jobs';
import type {
    AsyncJob,
    AutoTranscriptionJobPayload,
} from '@/lib/db/types';

export async function enqueueAutoTranscriptionJob(
    payload: AutoTranscriptionJobPayload
): Promise<AsyncJob> {
    const existing = await findActiveAsyncJob({
        type: 'auto_transcription',
        firebaseUid: payload.firebaseUid,
        recordingId: payload.recordingId,
    });

    if (existing) {
        return existing;
    }

    return createAsyncJob({
        type: 'auto_transcription',
        status: 'queued',
        payload,
        runAt: new Date(),
    });
}

export async function enqueueGoogleContactsSyncJob(firebaseUid: string): Promise<AsyncJob> {
    const existing = await findActiveAsyncJob({
        type: 'google_contacts_sync',
        firebaseUid,
    });

    if (existing) {
        return existing;
    }

    return createAsyncJob({
        type: 'google_contacts_sync',
        status: 'queued',
        payload: { firebaseUid },
        runAt: new Date(),
    });
}

export async function enqueueSupportEmailJob(
    supportMessageId: string,
    firebaseUid: string | null
): Promise<AsyncJob> {
    const normalizedFirebaseUid = firebaseUid || 'anonymous';
    const existing = await findActiveAsyncJob({
        type: 'support_email',
        firebaseUid: normalizedFirebaseUid,
        supportMessageId,
    });

    if (existing) {
        return existing;
    }

    return createAsyncJob({
        type: 'support_email',
        status: 'queued',
        payload: {
            firebaseUid: normalizedFirebaseUid,
            supportMessageId,
        },
        runAt: new Date(),
    });
}

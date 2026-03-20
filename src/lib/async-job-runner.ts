import { logger } from '@/lib/logger';
import {
    claimNextAsyncJob,
    markAsyncJobCompleted,
    rescheduleOrFailAsyncJob,
} from '@/lib/db/async-jobs';
import type { AsyncJob } from '@/lib/db/types';
import {
    markAutoTranscriptionJobFailed,
    triggerAutoTranscription,
} from '@/app/actions/upload/transcription';
import {
    markQueuedGoogleContactsSyncFailed,
    runQueuedGoogleContactsSync,
} from '@/services/google/start-contacts-sync';
import {
    getSupportMessageById,
    markSupportMessageFailed,
    markSupportMessageQueued,
    markSupportMessageSending,
    markSupportMessageSent,
} from '@/lib/db/support-messages';
import { sendSupportMessageNotification } from '@/lib/support-email';
import { env } from '@/lib/env';

async function processAutoTranscriptionJob(job: AsyncJob) {
    const payload = job.payload;
    if (!('recordingId' in payload)) {
        throw new Error('Invalid auto transcription job payload');
    }

    await triggerAutoTranscription(
        payload.firebaseUid,
        payload.recordingId,
        payload.r2Key,
        payload.duration,
        payload.fileSize,
        payload.fileName,
        payload.standardizedDisplayName
    );
}

async function processGoogleContactsSyncJob(job: AsyncJob) {
    const payload = job.payload;
    await runQueuedGoogleContactsSync(payload.firebaseUid);
}

async function processSupportEmailJob(job: AsyncJob) {
    const payload = job.payload;
    if (!('supportMessageId' in payload)) {
        throw new Error('Invalid support email job payload');
    }

    await markSupportMessageSending(payload.supportMessageId, job.attempts);

    const supportMessage = await getSupportMessageById(payload.supportMessageId);
    if (!supportMessage) {
        throw new Error('Support message not found');
    }

    const supportEmail = env.SUPPORT_EMAIL;

    await sendSupportMessageNotification(supportMessage, supportEmail);
    await markSupportMessageSent(payload.supportMessageId, job.attempts);
}

async function finalizeTerminalFailure(job: AsyncJob, errorMessage: string) {
    if (job.type === 'auto_transcription') {
        const payload = job.payload;
        if ('recordingId' in payload) {
            await markAutoTranscriptionJobFailed(
                payload.firebaseUid,
                payload.recordingId,
                payload.standardizedDisplayName,
                errorMessage
            );
        }
        return;
    }

    if (job.type === 'google_contacts_sync') {
        await markQueuedGoogleContactsSyncFailed(job.payload.firebaseUid, errorMessage);
        return;
    }

    if ('supportMessageId' in job.payload) {
        await markSupportMessageFailed(job.payload.supportMessageId, {
            deliveryAttempts: job.attempts,
            errorMessage,
        });
    }
}

async function handleRetryableFailure(job: AsyncJob, errorMessage: string) {
    if (job.type !== 'support_email') {
        return;
    }

    const payload = job.payload;
    if (!('supportMessageId' in payload)) {
        return;
    }

    await markSupportMessageQueued(payload.supportMessageId, {
        deliveryAttempts: job.attempts,
        lastDeliveryError: errorMessage,
    });
}

export async function processNextAsyncJob(workerId: string = 'async-job-cron') {
    const job = await claimNextAsyncJob(workerId);
    if (!job) {
        return {
            status: 'idle' as const,
        };
    }

    try {
        if (job.type === 'auto_transcription') {
            await processAutoTranscriptionJob(job);
        } else if (job.type === 'google_contacts_sync') {
            await processGoogleContactsSyncJob(job);
        } else {
            await processSupportEmailJob(job);
        }

        await markAsyncJobCompleted(job._id.toString());
        return {
            status: 'completed' as const,
            jobId: job._id.toString(),
            jobType: job.type,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown async job error';
        logger.error(`[async-jobs] Failed processing ${job.type} job ${job._id.toString()}:`, error);

        const nextState = await rescheduleOrFailAsyncJob(job, errorMessage);
        if (nextState === 'failed') {
            await finalizeTerminalFailure(job, errorMessage);
        } else {
            await handleRetryableFailure(job, errorMessage);
        }

        return {
            status: nextState,
            jobId: job._id.toString(),
            jobType: job.type,
            error: errorMessage,
        };
    }
}

import { ObjectId } from 'mongodb';

import { Collections, getMongoDb } from '@/lib/mongodb';
import {
    AsyncJob,
    AsyncJobResponse,
    CreateAsyncJobInput,
} from '@/lib/db/types';

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_STALE_AFTER_MINUTES = 15;
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;

export function computeAsyncJobRetryDelayMs(attempts: number): number {
    return Math.min(MAX_RETRY_DELAY_MS, 30_000 * 2 ** Math.max(0, attempts - 1));
}

export async function createAsyncJob(input: CreateAsyncJobInput): Promise<AsyncJob> {
    const db = await getMongoDb();
    const now = new Date();

    const job: AsyncJob = {
        _id: new ObjectId(),
        type: input.type,
        status: input.status,
        payload: input.payload,
        attempts: input.attempts ?? 0,
        maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        runAt: input.runAt,
        createdAt: now,
        updatedAt: now,
    };

    await db.collection<AsyncJob>(Collections.ASYNC_JOBS).insertOne(job);
    return job;
}

export async function findActiveAsyncJob(filter: {
    type: AsyncJob['type'];
    firebaseUid: string;
    recordingId?: string;
    supportMessageId?: string;
}): Promise<AsyncJob | null> {
    const db = await getMongoDb();

    return db.collection<AsyncJob>(Collections.ASYNC_JOBS).findOne({
        type: filter.type,
        status: { $in: ['queued', 'running'] },
        'payload.firebaseUid': filter.firebaseUid,
        ...(filter.recordingId ? { 'payload.recordingId': filter.recordingId } : {}),
        ...(filter.supportMessageId ? { 'payload.supportMessageId': filter.supportMessageId } : {}),
    });
}

export async function getAsyncJobById(jobId: string): Promise<AsyncJob | null> {
    const db = await getMongoDb();

    return db.collection<AsyncJob>(Collections.ASYNC_JOBS).findOne({
        _id: new ObjectId(jobId),
    });
}

export async function claimNextAsyncJob(
    workerId: string,
    staleAfterMinutes: number = DEFAULT_STALE_AFTER_MINUTES
): Promise<AsyncJob | null> {
    const db = await getMongoDb();
    const now = new Date();
    const staleBefore = new Date(now.getTime() - staleAfterMinutes * 60 * 1000);

    return db.collection<AsyncJob>(Collections.ASYNC_JOBS).findOneAndUpdate(
        {
            $or: [
                {
                    status: 'queued',
                    runAt: { $lte: now },
                },
                {
                    status: 'running',
                    lockedAt: { $lt: staleBefore },
                },
            ],
        },
        {
            $set: {
                status: 'running',
                lockedAt: now,
                lockedBy: workerId,
                updatedAt: now,
            },
            $inc: {
                attempts: 1,
            },
            $unset: {
                completedAt: '',
                lastError: '',
            },
        },
        {
            sort: { runAt: 1, createdAt: 1 },
            returnDocument: 'after',
        }
    );
}

export async function markAsyncJobCompleted(jobId: string): Promise<void> {
    const db = await getMongoDb();
    const now = new Date();

    await db.collection<AsyncJob>(Collections.ASYNC_JOBS).updateOne(
        { _id: new ObjectId(jobId) },
        {
            $set: {
                status: 'completed',
                updatedAt: now,
                completedAt: now,
            },
            $unset: {
                lockedAt: '',
                lockedBy: '',
                lastError: '',
            },
        }
    );
}

export async function rescheduleOrFailAsyncJob(
    job: AsyncJob,
    errorMessage: string
): Promise<'queued' | 'failed'> {
    const db = await getMongoDb();
    const now = new Date();

    if (job.attempts >= job.maxAttempts) {
        await db.collection<AsyncJob>(Collections.ASYNC_JOBS).updateOne(
            { _id: job._id },
            {
                $set: {
                    status: 'failed',
                    lastError: errorMessage,
                    updatedAt: now,
                },
                $unset: {
                    lockedAt: '',
                    lockedBy: '',
                },
            }
        );
        return 'failed';
    }

    const retryDelayMs = computeAsyncJobRetryDelayMs(job.attempts);
    await db.collection<AsyncJob>(Collections.ASYNC_JOBS).updateOne(
        { _id: job._id },
        {
            $set: {
                status: 'queued',
                runAt: new Date(now.getTime() + retryDelayMs),
                lastError: errorMessage,
                updatedAt: now,
            },
            $unset: {
                lockedAt: '',
                lockedBy: '',
                completedAt: '',
            },
        }
    );
    return 'queued';
}

export async function retryAsyncJobNow(jobId: string): Promise<boolean> {
    const db = await getMongoDb();
    const result = await db.collection<AsyncJob>(Collections.ASYNC_JOBS).updateOne(
        { _id: new ObjectId(jobId) },
        {
            $set: {
                status: 'queued',
                attempts: 0,
                runAt: new Date(),
                updatedAt: new Date(),
            },
            $unset: {
                lockedAt: '',
                lockedBy: '',
                completedAt: '',
                lastError: '',
            },
        }
    );

    return result.modifiedCount > 0;
}

export async function getAsyncJobStats(): Promise<{
    queuedCount: number;
    runningCount: number;
    failedCount: number;
    recentFailed: AsyncJobResponse[];
}> {
    const db = await getMongoDb();
    const jobs = db.collection<AsyncJob>(Collections.ASYNC_JOBS);

    const [queuedCount, runningCount, failedCount, failedJobs] = await Promise.all([
        jobs.countDocuments({ status: 'queued' }),
        jobs.countDocuments({ status: 'running' }),
        jobs.countDocuments({ status: 'failed' }),
        jobs.find({ status: 'failed' }).sort({ updatedAt: -1 }).limit(10).toArray(),
    ]);

    return {
        queuedCount,
        runningCount,
        failedCount,
        recentFailed: failedJobs.map(toAsyncJobResponse),
    };
}

export function toAsyncJobResponse(job: AsyncJob): AsyncJobResponse {
    return {
        id: job._id.toString(),
        type: job.type,
        status: job.status,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        runAt: job.runAt.toISOString(),
        lastError: job.lastError,
        updatedAt: job.updatedAt.toISOString(),
        createdAt: job.createdAt.toISOString(),
        firebaseUid: job.payload.firebaseUid,
        recordingId: 'recordingId' in job.payload ? job.payload.recordingId : undefined,
        supportMessageId: 'supportMessageId' in job.payload ? job.payload.supportMessageId : undefined,
    };
}

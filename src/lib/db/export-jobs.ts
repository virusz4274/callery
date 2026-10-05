import { ObjectId } from 'mongodb';
import { getMongoDb } from '@/lib/mongodb';
import { ExportJob, CreateExportJobInput } from './types';

const COLLECTIONS = {
    EXPORT_JOBS: 'export_jobs',
};

export async function createExportJob(data: CreateExportJobInput): Promise<ExportJob> {
    const db = await getMongoDb();
    const now = new Date();

    const job: ExportJob = {
        ...data,
        _id: new ObjectId(),
        createdAt: now,
        updatedAt: now,
    };

    await db.collection<ExportJob>(COLLECTIONS.EXPORT_JOBS).insertOne(job);
    return job;
}

export async function getExportJob(jobId: string, authSubject: string): Promise<ExportJob | null> {
    const db = await getMongoDb();
    return db.collection<ExportJob>(COLLECTIONS.EXPORT_JOBS).findOne({
        _id: new ObjectId(jobId),
        authSubject,
    });
}

export async function getLatestExportJob(authSubject: string): Promise<ExportJob | null> {
    const db = await getMongoDb();
    const headers = await db.collection<ExportJob>(COLLECTIONS.EXPORT_JOBS)
        .find({ authSubject })
        .sort({ createdAt: -1 })
        .limit(1)
        .toArray();

    return headers[0] || null;
}

export async function updateExportJob(
    jobId: string,
    authSubject: string,
    updates: Partial<Omit<ExportJob, '_id' | 'authSubject' | 'createdAt'>>
): Promise<void> {
    const db = await getMongoDb();
    await db.collection<ExportJob>(COLLECTIONS.EXPORT_JOBS).updateOne(
        { _id: new ObjectId(jobId), authSubject },
        {
            $set: {
                ...updates,
                updatedAt: new Date()
            }
        }
    );
}

/**
 * Atomically claim the next export job for processing.
 * Claims oldest pending job first, or stale processing jobs (worker recovery).
 */
export async function claimNextExportJob(
    staleAfterMinutes: number = 180
): Promise<ExportJob | null> {
    const db = await getMongoDb();
    const now = new Date();
    const staleBefore = new Date(now.getTime() - staleAfterMinutes * 60 * 1000);

    const result = await db.collection<ExportJob>(COLLECTIONS.EXPORT_JOBS).findOneAndUpdate(
        {
            $or: [
                { status: 'pending' },
                {
                    status: 'processing',
                    updatedAt: { $lt: staleBefore }
                }
            ]
        },
        {
            $set: {
                status: 'processing',
                startedAt: now,
                updatedAt: now,
            },
            $unset: {
                error: '',
                completedAt: '',
            },
        },
        {
            sort: { createdAt: 1 },
            returnDocument: 'after',
        }
    );

    return result;
}

export function toExportJobResponse(job: ExportJob) {
    return {
        id: job._id.toString(),
        status: job.status,
        progress: job.progress,
        parts: job.parts?.map(p => ({
            url: p.url,
            expiresAt: p.expiresAt.toISOString(),
        })),
        error: job.error,
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString(),
    };
}

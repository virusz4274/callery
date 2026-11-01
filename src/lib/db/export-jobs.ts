import { ObjectId } from 'mongodb';
import { getMongoDb } from '@/lib/mongodb';
import { ExportJob, CreateExportJobInput } from './types';

const COLLECTIONS = {
    EXPORT_JOBS: 'export_jobs',
};

export async function createExportJob(data: CreateExportJobInput, database?: import('mongodb').Db, deterministicId?: ObjectId): Promise<ExportJob> {
    const db = database || await getMongoDb();
    const now = new Date();

    const job: ExportJob = {
        ...data,
        _id: deterministicId || new ObjectId(),
        createdAt: now,
        updatedAt: now,
    };

    try { await db.collection<ExportJob>(COLLECTIONS.EXPORT_JOBS).insertOne(job); }
    catch (error) {
        if (!deterministicId || (error as { code?: number }).code !== 11000) throw error;
        const old = await db.collection<ExportJob>(COLLECTIONS.EXPORT_JOBS).findOne({ _id: deterministicId, authSubject: data.authSubject });
        if (!old || old.costReservationId !== data.costReservationId || old.sourceRevision !== data.sourceRevision) throw new Error('Export admission identity changed.');
        return old;
    }
    return job;
}

export async function getExportJob(jobId: string, authSubject: string, database?: import('mongodb').Db): Promise<ExportJob | null> {
    const db = database || await getMongoDb();
    return db.collection<ExportJob>(COLLECTIONS.EXPORT_JOBS).findOne({
        _id: new ObjectId(jobId),
        authSubject,
    });
}

export async function getLatestExportJob(authSubject: string, database?: import('mongodb').Db): Promise<ExportJob | null> {
    const db = database || await getMongoDb();
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

/** A worker checkpoint must never revive an archive revoked by account cleanup. */
export async function updateActiveExportJob(jobId: string, authSubject: string, updates: Partial<Omit<ExportJob, '_id' | 'authSubject' | 'createdAt'>>, database?: import('mongodb').Db): Promise<void> {
    const db = database || await getMongoDb();
    const result = await db.collection<ExportJob>(COLLECTIONS.EXPORT_JOBS).updateOne(
        { _id: new ObjectId(jobId), authSubject, cleanupPending: { $ne: true }, abortedAt: { $exists: false }, cleanedAt: { $exists: false } },
        { $set: { ...updates, updatedAt: new Date() } },
    );
    if (!result.matchedCount) throw new Error('This export was cancelled because its archive is being removed.');
}

/** A crashed generation may resume once within the original audited cost cap. */
export async function beginExportJobAttempt(jobId: string, authSubject: string, database?: import('mongodb').Db): Promise<void> {
    const db = database || await getMongoDb();
    const result = await db.collection<ExportJob>(COLLECTIONS.EXPORT_JOBS).updateOne({
        _id: new ObjectId(jobId), authSubject, cleanupPending: { $ne: true }, abortedAt: { $exists: false }, cleanedAt: { $exists: false },
        $or: [{ generationAttempts: { $exists: false } }, { generationAttempts: { $lt: 2 } }],
    }, { $inc: { generationAttempts: 1 }, $set: { updatedAt: new Date() } });
    if (!result.matchedCount) throw new Error('This archive used its normal generation attempt and single recovery attempt. Request a new funded export.');
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
            cleanupPending: { $ne: true },
            abortedAt: { $exists: false },
            cleanedAt: { $exists: false },
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
        parts: job.parts.map(p => ({
            url: p.url,
            expiresAt: p.expiresAt.toISOString(),
        })),
        error: job.error,
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString(),
    };
}

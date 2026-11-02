import { randomUUID } from 'node:crypto';
import { ObjectId, type Db, type Filter } from 'mongodb';
import { getMongoDb } from '@/lib/mongodb';
import type { ExportJob, CreateExportJobInput, ExportJobResponse } from './types';
import { ARCHIVE_TTL_MS } from '@/lib/export-processor/constants';
import { exportFailureMessage } from '@/lib/export-processor/errors';

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
export async function updateActiveExportJob(jobId: string, authSubject: string, updates: Partial<Omit<ExportJob, '_id' | 'authSubject' | 'createdAt'>>, database?: Db, workerToken?: string): Promise<void> {
    const db = database || await getMongoDb();
    const result = await db.collection<ExportJob>(COLLECTIONS.EXPORT_JOBS).updateOne(
        { _id: new ObjectId(jobId), authSubject, ...activeFilter(), ...(workerToken ? workerFilter(workerToken) : {}) },
        { $set: { ...updates, updatedAt: new Date() } },
    );
    if (!result.matchedCount) {
        if (workerToken) throw new ExportWorkerOwnershipError();
        throw new Error('This export was cancelled because its archive is being removed.');
    }
}

export class ExportWorkerOwnershipError extends Error {
    constructor() {
        super('This export worker no longer owns an active archive.');
        this.name = 'ExportWorkerOwnershipError';
    }
}

function activeFilter(): Filter<ExportJob> {
    return { cleanupPending: { $ne: true }, abortedAt: { $exists: false }, cleanedAt: { $exists: false } };
}

function workerFilter(workerToken: string): Filter<ExportJob> {
    return { workerToken, status: 'processing', workerLeaseUntil: { $gt: new Date() } };
}

function claimableFilter(staleAfterMinutes: number, now: Date): Filter<ExportJob> {
    return { ...activeFilter(), $and: [
        { $or: [{ archiveExpiresAt: { $gt: now } }, { archiveExpiresAt: { $exists: false }, createdAt: { $gt: new Date(now.getTime() - ARCHIVE_TTL_MS) } }] },
        { $or: [
            { status: 'pending' },
            { status: 'processing', workerLeaseUntil: { $lte: now } },
            { status: 'processing', workerLeaseUntil: { $exists: false }, updatedAt: { $lte: new Date(now.getTime() - staleAfterMinutes * 60_000) } },
        ] },
    ] };
}

function snapshotFilter(job: ExportJob): Filter<ExportJob> {
    return { _id: job._id, authSubject: job.authSubject, status: job.status, updatedAt: job.updatedAt,
        generationAttempts: job.generationAttempts === undefined ? { $exists: false } : job.generationAttempts,
        workerToken: job.workerToken === undefined ? { $exists: false } : job.workerToken,
    };
}

async function claimCandidate(job: ExportJob, staleAfterMinutes: number, db: Db): Promise<ExportJob | null> {
    const now = new Date();
    // Old processing jobs have already consumed their first generation.
    const attempts = job.generationAttempts ?? (job.status === 'processing' ? 1 : 0);
    const filter: Filter<ExportJob> = { ...snapshotFilter(job), ...claimableFilter(staleAfterMinutes, now) };
    if (attempts >= 2) {
        await db.collection<ExportJob>(COLLECTIONS.EXPORT_JOBS).updateOne(filter, { $set: {
            status: 'failed', updatedAt: now,
            error: exportFailureMessage({ stage: 'validation', code: 'attempts-exhausted' }),
            failure: { stage: 'validation', code: 'attempts-exhausted', retryable: false, occurredAt: now, generationAttempt: attempts },
        }, $unset: { workerToken: '', workerLeaseUntil: '' } });
        return null;
    }
    return db.collection<ExportJob>(COLLECTIONS.EXPORT_JOBS).findOneAndUpdate(filter, {
        $set: { status: 'processing', startedAt: job.startedAt || now, updatedAt: now, generationAttempts: attempts + 1,
            workerToken: randomUUID(), workerLeaseUntil: new Date(now.getTime() + staleAfterMinutes * 60_000) },
        $unset: { error: '', failure: '', completedAt: '' },
    }, { returnDocument: 'after' });
}

/** Both inline execution and cron must win this compare-and-set before doing work. */
export async function claimExportJob(jobId: string, authSubject: string, staleAfterMinutes = 180, database?: Db): Promise<ExportJob | null> {
    if (!ObjectId.isValid(jobId)) return null;
    const db = database || await getMongoDb();
    const job = await getExportJob(jobId, authSubject, db);
    return job ? claimCandidate(job, staleAfterMinutes, db) : null;
}

/** Claims oldest pending work or recovers an abandoned worker, never arbitrary failed jobs. */
export async function claimNextExportJob(staleAfterMinutes = 180, database?: Db): Promise<ExportJob | null> {
    const db = database || await getMongoDb();
    // Skip terminalized exhausted jobs without allowing an unbounded cron loop.
    for (let examined = 0; examined < 10; examined++) {
        const [job] = await db.collection<ExportJob>(COLLECTIONS.EXPORT_JOBS).find(claimableFilter(staleAfterMinutes, new Date())).sort({ createdAt: 1 }).limit(1).toArray();
        if (!job) return null;
        const claimed = await claimCandidate(job, staleAfterMinutes, db);
        if (claimed) return claimed;
    }
    return null;
}

export async function heartbeatExportJob(jobId: string, authSubject: string, workerToken: string, staleAfterMinutes: number, database?: Db): Promise<boolean> {
    const db = database || await getMongoDb();
    const now = new Date();
    const result = await db.collection<ExportJob>(COLLECTIONS.EXPORT_JOBS).updateOne({
        _id: new ObjectId(jobId), authSubject, ...activeFilter(), ...workerFilter(workerToken),
    }, { $set: { updatedAt: now, workerLeaseUntil: new Date(now.getTime() + staleAfterMinutes * 60_000) } });
    return Boolean(result.matchedCount);
}

export async function assertExportWorkerOwned(jobId: string, authSubject: string, workerToken: string, database?: Db): Promise<void> {
    const db = database || await getMongoDb();
    if (!await db.collection<ExportJob>(COLLECTIONS.EXPORT_JOBS).findOne({ _id: new ObjectId(jobId), authSubject, ...activeFilter(), ...workerFilter(workerToken) })) {
        throw new ExportWorkerOwnershipError();
    }
}

export function toExportJobResponse(job: ExportJob): ExportJobResponse {
    return {
        id: job._id.toString(),
        status: job.status,
        progress: job.progress,
        parts: job.parts.map(p => ({
            url: p.url,
            expiresAt: p.expiresAt.toISOString(),
        })),
        error: job.failure ? exportFailureMessage(job.failure) : job.error
            ? job.cleanedAt || job.abortedAt || job.cleanupPending || (job.archiveExpiresAt && job.archiveExpiresAt <= new Date())
                ? 'This export archive has expired. Individual recording downloads remain available.'
                : 'The export could not be completed.'
            : undefined,
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString(),
    };
}

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

export async function getExportJob(jobId: string, firebaseUid: string): Promise<ExportJob | null> {
    const db = await getMongoDb();
    return db.collection<ExportJob>(COLLECTIONS.EXPORT_JOBS).findOne({
        _id: new ObjectId(jobId),
        firebaseUid,
    });
}

export async function getLatestExportJob(firebaseUid: string): Promise<ExportJob | null> {
    const db = await getMongoDb();
    const headers = await db.collection<ExportJob>(COLLECTIONS.EXPORT_JOBS)
        .find({ firebaseUid })
        .sort({ createdAt: -1 })
        .limit(1)
        .toArray();

    return headers[0] || null;
}

export async function updateExportJob(
    jobId: string,
    firebaseUid: string,
    updates: Partial<Omit<ExportJob, '_id' | 'firebaseUid' | 'createdAt'>>
): Promise<void> {
    const db = await getMongoDb();
    await db.collection<ExportJob>(COLLECTIONS.EXPORT_JOBS).updateOne(
        { _id: new ObjectId(jobId), firebaseUid },
        {
            $set: {
                ...updates,
                updatedAt: new Date()
            }
        }
    );
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

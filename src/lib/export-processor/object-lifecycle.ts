import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { ObjectId, type Db, type Filter } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { ExportJob, User } from '@/lib/db/types';
import { getStorageClient, storageBucket } from '@/lib/r2';
import { ARCHIVE_TTL_MS } from './constants';
import { finishExportBudget } from './policy';
import { assertExportWorkerOwned, ExportWorkerOwnershipError } from '@/lib/db/export-jobs';
import { ExportProcessingError } from './errors';
import { getExportStorageClient } from './storage-client';
import { isNotFoundError } from './retry';

export const EXPORT_OBJECT_WRITES = 'export_object_cleanup';
export const EXPORT_WRITE_LEASE_MS = 5 * 60_000;
export interface ExportObjectWrite {
    _id: string;
    subject: string;
    jobId: string;
    owner: string;
    state: 'writing' | 'ready' | 'pending' | 'deleting';
    cleanupToken?: string;
    cleanupLeaseUntil?: Date;
    leaseUntil: Date;
    expiresAt: Date;
    createdAt: Date;
}

/** Account erasure is a permanent fence for an already admitted export. */
export async function assertExportActive(subject: string, jobId: string, database?: Db, workerToken?: string): Promise<void> {
    const db = database || await getMongoDb();
    const [user, job] = await Promise.all([
        db.collection<User>(Collections.USERS).findOne({ authSubject: subject }),
        db.collection<ExportJob>(Collections.EXPORT_JOBS).findOne({ _id: new ObjectId(jobId), authSubject: subject }),
    ]);
    if (!user || user.softDelete?.isDeleted || user.billingRecovery?.purgingAt || user.billingRecovery?.purgedAt ||
        !job || job.cleanupPending || job.cleanedAt || job.abortedAt ||
        (job.archiveExpiresAt ? job.archiveExpiresAt <= new Date() : job.createdAt && job.createdAt.getTime() + ARCHIVE_TTL_MS <= Date.now())) {
        throw new ExportProcessingError('validation', 'cancelled');
    }
    if (workerToken) await assertExportWorkerOwned(jobId, subject, workerToken, db);
}

/** Insert before PUT, then recheck the account: deletion may have begun while inserting. */
export async function beginExportObjectWrite(subject: string, jobId: string, key: string, database?: Db, workerToken?: string): Promise<ExportObjectWrite> {
    const db = database || await getMongoDb();
    const now = new Date();
    const intent: ExportObjectWrite = { _id: key, subject, jobId, owner: randomUUID(), state: 'writing', leaseUntil: new Date(now.getTime() + EXPORT_WRITE_LEASE_MS), expiresAt: new Date(now.getTime() + ARCHIVE_TTL_MS), createdAt: now };
    await db.collection<ExportObjectWrite>(EXPORT_OBJECT_WRITES).insertOne(intent);
    try { await assertExportActive(subject, jobId, db, workerToken); }
    catch (error) { await abandonExportObjectWrite(intent, db); throw error; }
    return intent;
}

export async function abandonExportObjectWrite(intent: ExportObjectWrite, database?: Db): Promise<void> {
    const db = database || await getMongoDb();
    await db.collection<ExportObjectWrite>(EXPORT_OBJECT_WRITES).updateOne({ _id: intent._id, owner: intent.owner, state: 'writing' }, { $set: { state: 'pending' } });
}

/** A revoker changes state before deleting bytes, so a late writer cannot publish. */
export async function completeExportObjectWrite(intent: ExportObjectWrite, database?: Db, workerToken?: string): Promise<boolean> {
    const db = database || await getMongoDb();
    try { await assertExportActive(intent.subject, intent.jobId, db, workerToken); }
    catch (error) {
        if (!(error instanceof ExportWorkerOwnershipError) && !(error instanceof ExportProcessingError && error.code === 'cancelled')) throw error;
        await abandonExportObjectWrite(intent, db);
        return false;
    }
    const result = await db.collection<ExportObjectWrite>(EXPORT_OBJECT_WRITES).updateOne({ _id: intent._id, owner: intent.owner, state: 'writing', leaseUntil: { $gt: new Date() } }, { $set: { state: 'ready', expiresAt: new Date(Date.now() + ARCHIVE_TTL_MS) } });
    if (!result.matchedCount) { await abandonExportObjectWrite(intent, db); return false; }
    return true;
}

/** A saved checkpoint is useful only while every acknowledged part still exists. */
export async function verifyCheckpointParts(job: ExportJob, database?: Db, headObject?: (key: string) => Promise<number | null>): Promise<void> {
    const db = database || await getMongoDb();
    const head = headObject || (async (key: string) => {
        try {
            return (await getExportStorageClient().send(new HeadObjectCommand({ Bucket: storageBucket(), Key: key }))).ContentLength ?? null;
        } catch (error) {
            if (isNotFoundError(error)) return null;
            throw error;
        }
    });
    const fail = () => new ExportProcessingError('checkpoint', 'archive');
    if (!job.checkpoint || job.checkpoint.nextPartNumber !== job.parts.length + 1 ||
        !Number.isSafeInteger(job.processedRecordings) || job.processedRecordings < 0 || job.processedRecordings > job.totalRecordings ||
        (job.processedRecordings > 0 && (!job.checkpoint.cursorId || !job.checkpoint.cursorRecordedAt)) ||
        (job.processedRecordings === 0 && job.parts.length > 0)) throw fail();
    const seen = new Set<string>();
    for (const part of job.parts) {
        if (seen.has(part.key) || !part.key.startsWith(`exports/${job.authSubject}/${job._id}/`) || !Number.isSafeInteger(part.size) || part.size <= 0) throw fail();
        seen.add(part.key);
        const intent = await db.collection<ExportObjectWrite>(EXPORT_OBJECT_WRITES).findOne({
            _id: part.key, subject: job.authSubject, jobId: job._id.toString(), state: 'ready', expiresAt: { $gt: new Date() },
        });
        if (!intent || await head(part.key) !== part.size) throw fail();
    }
}

/** Renewal loses to cleanup's conditional deletion claim; it can never revive a revoked part. */
export async function renewExportParts(job: ExportJob, expiresAt: Date, database?: Db): Promise<void> {
    const db = database || await getMongoDb();
    for (const part of job.parts) {
        const result = await db.collection<ExportObjectWrite>(EXPORT_OBJECT_WRITES).updateOne({
            _id: part.key, subject: job.authSubject, jobId: job._id.toString(), state: 'ready', expiresAt: { $gt: new Date() },
        }, { $set: { expiresAt } });
        if (!result.matchedCount) throw new ExportProcessingError('finalize', 'cancelled');
    }
}

/** Call before collecting/deleting keys. Keep these intents after identity erasure. */
export async function revokeExportObjects(subject: string, db: Db): Promise<string[]> {
    const now = new Date();
    await db.collection<ExportJob>(Collections.EXPORT_JOBS).updateMany({ authSubject: subject }, { $set: { cleanupPending: true, abortedAt: now, cacheEligible: false } });
    await db.collection<ExportObjectWrite>(EXPORT_OBJECT_WRITES).updateMany({ subject }, { $set: { state: 'pending' } });
    for (const job of await db.collection<ExportJob>(Collections.EXPORT_JOBS).find({ authSubject: subject, costSettledAt: { $exists: false } }).toArray()) await settleRevokedExportBudget(job, db);
    return (await db.collection<ExportObjectWrite>(EXPORT_OBJECT_WRITES).find({ subject }).toArray()).map(row => row._id);
}

/** Revocation prevents future work; a crashed worker's bounded spend is retained. */
export async function settleRevokedExportBudget(job: ExportJob, db: Db): Promise<void> {
    if (!job.costReservationId || job.maximumCostMicros === undefined || job.costSettledAt) return;
    await finishExportBudget(job.authSubject, { id: job.costReservationId, maximumCostMicros: job.maximumCostMicros,
        source: job.costBudgetSource || 'customer', poolId: job.costBudgetPoolId, unpriced: job.costUnpriced,
        estimateStale: job.costEstimateStale, costPolicyVersion: job.costPolicyVersion }, Boolean(job.costStartedAt), db);
    await db.collection<ExportJob>(Collections.EXPORT_JOBS).updateOne({ _id: job._id }, { $set: { costSettledAt: new Date() } });
}

/** Close creation racing the account's irreversible cleanup claim. */
export async function confirmExportJobAdmission(job: ExportJob, db: Db): Promise<void> {
    try { await assertExportActive(job.authSubject, job._id.toString(), db); }
    catch (error) {
        // A transient database failure is not evidence of account erasure.
        if (!(error instanceof ExportProcessingError && error.code === 'cancelled')) throw error;
        await db.collection<ExportJob>(Collections.EXPORT_JOBS).updateOne({ _id: job._id }, { $set: { cleanupPending: true, abortedAt: new Date(), status: 'failed' } });
        await settleRevokedExportBudget(job, db);
        throw error;
    }
}

/** Never forget an intent while its bounded external PUT may still finish. */
export async function cleanupExportObjectWrites(db: Db, limit = 100, removeObject?: (key: string) => Promise<void>): Promise<number> {
    const now = new Date();
    const collection = db.collection<ExportObjectWrite>(EXPORT_OBJECT_WRITES);
    const due: Filter<ExportObjectWrite> = { leaseUntil: { $lte: now }, $or: [
        { state: 'pending' }, { state: 'writing' }, { state: 'ready', expiresAt: { $lte: now } },
        { state: 'deleting', cleanupLeaseUntil: { $lte: now } },
    ] };
    const rows = await collection.find(due).sort({ leaseUntil: 1 }).limit(limit).toArray();
    const remove = removeObject || (async (key: string) => { await getStorageClient().send(new DeleteObjectCommand({ Bucket: storageBucket(), Key: key })); });
    let cleaned = 0;
    for (const row of rows) {
        const cleanupToken = randomUUID();
        const claimed = await collection.findOneAndUpdate({ ...due, _id: row._id, owner: row.owner }, { $set: {
            state: 'deleting', cleanupToken, cleanupLeaseUntil: new Date(Date.now() + EXPORT_WRITE_LEASE_MS),
        } }, { returnDocument: 'after' });
        if (!claimed) continue;
        try {
            await remove(row._id);
            await collection.deleteOne({ _id: row._id, owner: row.owner, state: 'deleting', cleanupToken });
            cleaned++;
        } catch (error) {
            await collection.updateOne({ _id: row._id, state: 'deleting', cleanupToken }, {
                $set: { state: 'pending' }, $unset: { cleanupToken: '', cleanupLeaseUntil: '' },
            });
            throw error;
        }
    }
    return cleaned;
}

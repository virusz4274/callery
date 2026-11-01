import { DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { ExportJob } from '@/lib/db/types';
import { getStorageClient, storageBucket } from '@/lib/r2';
import { ARCHIVE_TTL_MS } from './constants';
import { cleanupExportObjectWrites, EXPORT_OBJECT_WRITES, settleRevokedExportBudget, type ExportObjectWrite } from './object-lifecycle';

/** Delete bytes, including PUTs interrupted before a part checkpoint; URL expiry alone is insufficient. */
export async function cleanupExpiredExports(limit = 10, dependencies?: { db: import('mongodb').Db; removePrefix: (prefix: string) => Promise<void>; removeObject?: (key: string) => Promise<void> }) {
    const db = dependencies?.db || await getMongoDb();
    const removePrefix = dependencies?.removePrefix || (async (prefix: string) => {
        let token: string | undefined;
        do {
            const page = await getStorageClient().send(new ListObjectsV2Command({ Bucket: storageBucket(), Prefix: prefix, ContinuationToken: token }));
            for (const object of page.Contents || []) if (object.Key?.startsWith(prefix)) await getStorageClient().send(new DeleteObjectCommand({ Bucket: storageBucket(), Key: object.Key }));
            token = page.IsTruncated ? page.NextContinuationToken : undefined;
        } while (token);
    });
    const now = new Date();
    await cleanupExportObjectWrites(db, limit * 10, dependencies?.removeObject);
    const rows = await db.collection<ExportJob>(Collections.EXPORT_JOBS).find({ cleanedAt: { $exists: false }, $or: [
        { cleanupPending: true }, { abortedAt: { $exists: true } },
        { archiveExpiresAt: { $lte: now } }, { archiveExpiresAt: { $exists: false }, createdAt: { $lte: new Date(now.getTime() - ARCHIVE_TTL_MS) } },
    ] }).sort({ createdAt: 1 }).limit(limit).toArray();
    let cleaned = 0;
    for (const job of rows) {
        await db.collection<ExportJob>(Collections.EXPORT_JOBS).updateOne({ _id: job._id }, { $set: { cleanupPending: true, abortedAt: job.abortedAt || now } });
        await db.collection<ExportObjectWrite>(EXPORT_OBJECT_WRITES).updateMany({ subject: job.authSubject, jobId: job._id.toString() }, { $set: { state: 'pending' } });
        // Read after the permanent fence: beginCost cannot race this snapshot.
        const revoked = await db.collection<ExportJob>(Collections.EXPORT_JOBS).findOne({ _id: job._id });
        if (revoked) await settleRevokedExportBudget(revoked, db);
        await removePrefix(`exports/${job.authSubject}/${job._id.toString()}/`);
        await db.collection<ExportJob>(Collections.EXPORT_JOBS).updateOne({ _id: job._id, cleanupPending: true }, { $set: {
            cleanedAt: new Date(), cleanupPending: false, parts: [], status: 'failed', error: 'This export archive expired after seven days.',
        } });
        cleaned++;
    }
    return { checked: rows.length, cleaned };
}

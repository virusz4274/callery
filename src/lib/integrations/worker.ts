import { Collections } from '@/lib/mongodb';
import { IntegrationCollections, integrationDb } from './database';
import { cleanupUpload, completeUpload, type UploadSession } from './uploads';
import { processTranscriptionJobs } from './jobs';

export async function processIngestion(limit = 20) {
    const db = await integrationDb(); const uploads = db.collection<UploadSession>(IntegrationCollections.uploads);
    const now = new Date();
    await uploads.updateMany({ state: { $in: ['initializing', 'uploading'] }, expiresAt: { $lte: now }, leaseUntil: { $lte: now } }, { $set: { state: 'expired', cleanupPending: true } });
    let recovered = 0; let cleaned = 0; let failed = 0;
    const pending = await uploads.find({ $or: [{ state: 'finalizing', leaseUntil: { $lte: now } }, { cleanupPending: true, state: { $in: ['completed', 'cancelled', 'expired'] }, leaseUntil: { $lte: now } }] }).limit(limit).toArray();
    for (const session of pending) {
        try {
            if (session.state === 'finalizing') { await completeUpload(session, db); recovered++; }
            else { await cleanupUpload(session, db); cleaned++; }
        } catch { failed++; }
    }
    // Keep deduplication keys for at least seven days. Keep sessions/receipts
    // until cleanup has completed. Settled receipts compact after one day so a
    // busy CRM cannot grow a user's MongoDB document without bound.
    await uploads.updateMany({ createdAt: { $lt: new Date(Date.now() - 7 * 86400_000) }, state: 'completed', cleanupPending: false }, { $unset: { requestKey: '' } });
    const settled = await uploads.find({ state: 'completed', cleanupPending: false, completedAt: { $lt: new Date(Date.now() - 86400_000) }, receiptCompacted: { $ne: true } }).limit(200).toArray();
    for (const session of settled) {
        await db.collection(Collections.USERS).updateOne({ authSubject: session.owner }, { $unset: { [`uploadReceipts.${session._id}`]: '' } });
        await db.collection<UploadSession>(IntegrationCollections.uploads).updateOne({ _id: session._id, state: 'completed' }, { $set: { receiptCompacted: true } });
    }
    const old = await uploads.find({ createdAt: { $lt: new Date(Date.now() - 30 * 86400_000) }, state: { $in: ['completed', 'cancelled', 'expired'] }, cleanupPending: false }).limit(limit).toArray();
    for (const session of old) {
        await db.collection(Collections.USERS).updateOne({ authSubject: session.owner }, { $unset: { [`uploadReceipts.${session._id}`]: '' } });
        await uploads.deleteOne({ _id: session._id, cleanupPending: false });
    }
    return { recovered, cleaned, failed, transcriptionJobs: await processTranscriptionJobs(5, db) };
}

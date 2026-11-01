import { Collections, getMongoDb } from '@/lib/mongodb';
import type { User } from '../types';
import type { Db } from 'mongodb';
import { createHash } from 'node:crypto';

/**
 * Increment the user's storage used counter.
 */
export async function incrementStorageUsed(authSubject: string, bytes: number, database?: Db): Promise<User | null> {
    const db = database || await getMongoDb();

    const result = await db.collection<User>(Collections.USERS).findOneAndUpdate(
        { authSubject },
        [
            { $set: { storageUsed: { $add: ['$storageUsed', bytes] }, updatedAt: new Date() } },
            { $set: {
                storagePeakUsed: { $max: [
                    { $cond: [
                        { $eq: [{ $ifNull: ['$storagePeakPeriodEnd', null] }, { $ifNull: ['$stripeCurrentPeriodEnd', null] }] },
                        '$storagePeakUsed',
                        0,
                    ] },
                    '$storageUsed',
                ] },
                storagePeakPeriodEnd: { $ifNull: ['$stripeCurrentPeriodEnd', null] },
            } },
        ],
        { returnDocument: 'after' }
    );

    return result as User | null;
}

/**
 * Decrement the user's storage used counter.
 */
export async function decrementStorageUsed(authSubject: string, bytes: number, database?: Db): Promise<void> {
    const db = database || await getMongoDb();

    await db.collection<User>(Collections.USERS).updateOne(
        { authSubject },
        [{ $set: {
            storageUsed: { $max: [0, { $subtract: ['$storageUsed', bytes] }] },
            updatedAt: new Date(),
        } }]
    );
}

/**
 * Update the user's storage peak usage for the current billing period.
 */
export async function setStoragePeakUsed(
    authSubject: string,
    peakBytes: number,
    periodEnd?: Date
): Promise<User | null> {
    const db = await getMongoDb();
    const updateData: Record<string, unknown> = {
        storagePeakUsed: peakBytes,
        updatedAt: new Date(),
    };

    if (periodEnd) {
        updateData.storagePeakPeriodEnd = periodEnd;
    }

    const result = await db.collection<User>(Collections.USERS).findOneAndUpdate(
        { authSubject },
        { $set: updateData },
        { returnDocument: 'after' }
    );

    return result as User | null;
}

/**
 * Increment the user's transcription usage counter.
 */
export async function incrementTranscriptionUsed(authSubject: string, seconds: number, receiptId?: string, database?: Db, acceptedAt?: Date): Promise<void> {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const db = database || await getMongoDb();
    const receipt = receiptId ? createHash('sha256').update(receiptId).digest('hex') : undefined;
    if (receiptId?.startsWith('transcription-v2:') && receipt) {
        const user = await db.collection<User>(Collections.USERS).findOne({ authSubject });
        // Managed quota and the corresponding counter commit together in the account CAS.
        // Avoid a second, unbounded per-user idempotency map for these canonical receipts.
        if (user?.billingAccount?.receipts[receipt] || await db.collection<{ _id: string }>('billing_usage_receipts').findOne({ _id: receipt })) return;
    }

    await db.collection<User>(Collections.USERS).updateOne(
        { authSubject, ...(receipt ? { [`transcriptionReceipts.${receipt}`]: { $exists: false } } : {}) },
        [{ $set: {
            transcriptionUsed: { $add: [{ $ifNull: ['$transcriptionUsed', 0] }, acceptedAt
                ? { $cond: [{ $gt: ['$stripeCurrentPeriodStart', acceptedAt] }, 0, Math.ceil(seconds)] }
                : Math.ceil(seconds)] },
            updatedAt: new Date(), ...(receipt ? { [`transcriptionReceipts.${receipt}`]: new Date() } : {}),
        } }]
    );
}

/**
 * Set the user's contact count to an exact value.
 */
export async function setContactCount(authSubject: string, totalContacts: number): Promise<void> {
    const db = await getMongoDb();

    await db.collection<User>(Collections.USERS).updateOne(
        { authSubject },
        {
            $set: {
                totalContacts,
                updatedAt: new Date(),
            },
        }
    );
}

/**
 * Update the user's recording statistics.
 */
export async function updateUserRecordingStats(
    authSubject: string,
    change: { count: number; duration: number }
): Promise<void> {
    const db = await getMongoDb();

    await db.collection<User>(Collections.USERS).updateOne(
        { authSubject },
        {
            $inc: {
                totalRecordings: change.count,
                totalDuration: change.duration,
            },
            $set: { updatedAt: new Date() },
        }
    );
}

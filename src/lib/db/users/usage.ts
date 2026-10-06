import { Collections, getMongoDb } from '@/lib/mongodb';
import type { User } from '../types';
import type { Db } from 'mongodb';

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
export async function incrementTranscriptionUsed(authSubject: string, seconds: number): Promise<void> {
    const db = await getMongoDb();

    await db.collection<User>(Collections.USERS).updateOne(
        { authSubject },
        {
            $inc: { transcriptionUsed: seconds },
            $set: { updatedAt: new Date() },
        }
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

import { Collections, getMongoDb } from '@/lib/mongodb';
import { isFreeTrialPlanKey, isLifetimePlanKey } from '@/lib/plans';
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
            { $set: { storageUsed: { $add: [{ $ifNull: ['$storageUsed', 0] }, bytes] }, updatedAt: new Date() } },
            { $set: {
                storagePeakUsed: { $max: [
                    { $cond: [
                        { $eq: [{ $ifNull: ['$storagePeakPeriodEnd', null] }, { $ifNull: ['$stripeCurrentPeriodEnd', null] }] },
                        { $ifNull: ['$storagePeakUsed', 0] },
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
            storageUsed: { $max: [0, { $subtract: [{ $ifNull: ['$storageUsed', 0] }, bytes] }] },
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
 * Bump the storage peak only if the new value is higher.
 */
export async function bumpStoragePeakUsed(
    authSubject: string,
    peakBytes: number,
    periodEnd?: Date
): Promise<boolean> {
    const db = await getMongoDb();
    const updateData: Record<string, unknown> = {
        storagePeakUsed: peakBytes,
        updatedAt: new Date(),
    };

    if (periodEnd) {
        updateData.storagePeakPeriodEnd = periodEnd;
    }

    const result = await db.collection<User>(Collections.USERS).findOneAndUpdate(
        {
            authSubject,
            $or: [{ storagePeakUsed: { $exists: false } }, { storagePeakUsed: { $lt: peakBytes } }],
        },
        { $set: updateData },
        { returnDocument: 'after' }
    );

    return !!result;
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
 * Increment the user's contact count.
 */
export async function incrementContactCount(authSubject: string, count: number): Promise<void> {
    const db = await getMongoDb();

    await db.collection<User>(Collections.USERS).updateOne(
        { authSubject },
        {
            $inc: { totalContacts: count },
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

/**
 * Check if the user's billing cycle has ended and reset usage if necessary.
 */
export async function checkAndResetUsageCycle(user: User): Promise<User> {
    if (isFreeTrialPlanKey(user.planKey) || isLifetimePlanKey(user.planKey)) {
        return user;
    }

    const subscriptionStatus = user.stripeSubscriptionStatus;
    const currentPeriodEnd = user.stripeCurrentPeriodEnd ? new Date(user.stripeCurrentPeriodEnd) : null;

    // Never perform local cycle resets for paid plans.
    // Stripe webhooks are the source of truth for renewals, delinquency, and period boundaries.
    if (
        subscriptionStatus &&
        subscriptionStatus !== 'active' &&
        subscriptionStatus !== 'trialing'
    ) {
        return user;
    }

    // If the app lacks a Stripe-managed period boundary, do not fabricate one locally.
    if (!currentPeriodEnd) {
        return user;
    }

    return user;
}

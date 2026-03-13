import { Collections, getMongoDb } from '@/lib/mongodb';
import type { User } from '../types';

/**
 * Increment the user's storage used counter.
 */
export async function incrementStorageUsed(firebaseUid: string, bytes: number): Promise<User | null> {
    const db = await getMongoDb();

    const result = await db.collection<User>(Collections.USERS).findOneAndUpdate(
        { firebaseUid },
        {
            $inc: { storageUsed: bytes },
            $set: { updatedAt: new Date() },
        },
        { returnDocument: 'after' }
    );

    return result as User | null;
}

/**
 * Decrement the user's storage used counter.
 */
export async function decrementStorageUsed(firebaseUid: string, bytes: number): Promise<void> {
    const db = await getMongoDb();

    await db.collection<User>(Collections.USERS).updateOne(
        { firebaseUid },
        {
            $inc: { storageUsed: -bytes },
            $set: { updatedAt: new Date() },
        }
    );
}

/**
 * Update the user's storage peak usage for the current billing period.
 */
export async function setStoragePeakUsed(
    firebaseUid: string,
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
        { firebaseUid },
        { $set: updateData },
        { returnDocument: 'after' }
    );

    return result as User | null;
}

/**
 * Bump the storage peak only if the new value is higher.
 */
export async function bumpStoragePeakUsed(
    firebaseUid: string,
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
            firebaseUid,
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
export async function incrementTranscriptionUsed(firebaseUid: string, seconds: number): Promise<void> {
    const db = await getMongoDb();

    await db.collection<User>(Collections.USERS).updateOne(
        { firebaseUid },
        {
            $inc: { transcriptionUsed: seconds },
            $set: { updatedAt: new Date() },
        }
    );
}

/**
 * Increment the user's contact count.
 */
export async function incrementContactCount(firebaseUid: string, count: number): Promise<void> {
    const db = await getMongoDb();

    await db.collection<User>(Collections.USERS).updateOne(
        { firebaseUid },
        {
            $inc: { totalContacts: count },
            $set: { updatedAt: new Date() },
        }
    );
}

/**
 * Update the user's recording statistics.
 */
export async function updateUserRecordingStats(
    firebaseUid: string,
    change: { count: number; duration: number }
): Promise<void> {
    const db = await getMongoDb();

    await db.collection<User>(Collections.USERS).updateOne(
        { firebaseUid },
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
    if (user.plan === 'Free Trial' || user.plan === 'Free' || user.plan === 'Lifetime') {
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

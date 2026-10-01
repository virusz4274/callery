import { getMongoDb, Collections } from '@/lib/mongodb';
import { deleteFromR2 } from '@/lib/r2';
import type { Recording, User } from '@/lib/db/types';
import { logger } from '@/lib/logger';

export interface DeleteUserDataResult {
    authSubject: string;
    email: string;
    recordingsDeleted: number;
    r2Failures: string[];
    stripeSubscriptionCanceled: boolean | null;
    stripeCancelError: string | null;
}

/**
 * Permanently delete a user and all their data: Stripe subscription,
 * R2 audio files, recordings, contacts, and the user document.
 *
 * Shared by admin user-delete and self-serve account deletion so both
 * paths remove exactly the same data. R2/Stripe failures are collected,
 * never thrown — the database deletes always complete.
 */
export async function deleteUserData(authSubject: string): Promise<DeleteUserDataResult> {
    const db = await getMongoDb();

    const user = await db.collection<User>(Collections.USERS).findOne({ authSubject });
    if (!user) {
        throw new Error('User not found');
    }

    const result: DeleteUserDataResult = {
        authSubject,
        email: user.email,
        recordingsDeleted: 0,
        r2Failures: [],
        stripeSubscriptionCanceled: null,
        stripeCancelError: null,
    };

    // 0. Cancel the Stripe subscription so no further billing occurs.
    if (user.stripeSubscriptionId) {
        try {
            const { billingEnabled } = await import('@/lib/config');
            if (billingEnabled()) {
                const { getStripe } = await import('@/lib/stripe');
                await getStripe().subscriptions.cancel(user.stripeSubscriptionId);
                result.stripeSubscriptionCanceled = true;
            }
        } catch (error) {
            result.stripeCancelError = error instanceof Error ? error.message : String(error);
            result.stripeSubscriptionCanceled = false;
            logger.error(`[deleteUserData] Stripe cancel failed for ${authSubject}:`, error);
        }
    }

    // 1. Collect R2 keys before deleting the documents.
    const recordings = await db
        .collection<Recording>(Collections.RECORDINGS)
        .find({ authSubject })
        .project({ r2Key: 1 })
        .toArray();

    // 2. Delete files from R2 (in parallel; failures collected).
    await Promise.all(
        recordings.map(async (rec) => {
            if (!rec.r2Key) return;
            try {
                await deleteFromR2(rec.r2Key);
            } catch (error) {
                logger.error(`[deleteUserData] R2 delete failed for ${rec.r2Key}:`, error);
                result.r2Failures.push(rec.r2Key);
            }
        })
    );

    // 3. Delete MongoDB documents.
    const deleted = await db.collection(Collections.RECORDINGS).deleteMany({ authSubject });
    result.recordingsDeleted = deleted.deletedCount;
    await db.collection(Collections.CONTACTS).deleteMany({ authSubject });
    await db.collection(Collections.USERS).deleteOne({ authSubject });

    return result;
}

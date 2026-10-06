import { ObjectId, type Db } from 'mongodb';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { deleteFromR2 } from '@/lib/r2';
import { billingEnabled } from '@/lib/config';
import { removeStoredObjects } from '@/lib/storage-cleanup';
import type { ExportJob, Recording, User } from './types';

export interface DeleteUserDataResult {
    authSubject: string;
    email: string;
    recordingsDeleted: number;
    r2Failures: string[];
    stripeSubscriptionCanceled: boolean | null;
    stripeCancelError: string | null;
    cleanupPending: boolean;
}

interface CleanupDependencies {
    db: Db;
    removeObject?: (key: string) => Promise<void>;
    removeIdentity?: (user: User) => Promise<void>;
    cancelSubscription?: (id: string) => Promise<void>;
}

async function removeIdentity(db: Db, user: User): Promise<void> {
    const userId = new ObjectId(user.authSubject);
    await db.collection('session').deleteMany({ userId });
    await db.collection('account').deleteMany({ userId });
    await db.collection('verification').deleteMany({ value: user.authSubject });
    await db.collection('user').deleteOne({ _id: userId });
}

export async function deleteUserData(subject: string, dependencies?: CleanupDependencies): Promise<DeleteUserDataResult> {
    const db = dependencies?.db || await getMongoDb();
    const user = await db.collection<User>(Collections.USERS).findOne({ authSubject: subject });
    if (!user) throw new Error('User not found');
    const result: DeleteUserDataResult = {
        authSubject: subject, email: user.email, recordingsDeleted: 0, r2Failures: [],
        stripeSubscriptionCanceled: null, stripeCancelError: null, cleanupPending: true,
    };
    const now = new Date();
    await db.collection<User>(Collections.USERS).updateOne({ authSubject: subject }, { $set: {
        disabled: true,
        softDelete: { isDeleted: true, deletedAt: user.softDelete?.deletedAt || now, restoreUntil: now, previousDisabled: !!user.disabled },
        updatedAt: now,
    } });
    if (user.stripeSubscriptionId && billingEnabled()) {
        try {
            if (dependencies?.cancelSubscription) await dependencies.cancelSubscription(user.stripeSubscriptionId);
            else {
                const { getStripe } = await import('@/lib/stripe');
                await getStripe().subscriptions.cancel(user.stripeSubscriptionId);
            }
            result.stripeSubscriptionCanceled = true;
        } catch (error) {
            result.stripeCancelError = error instanceof Error ? error.message : String(error);
            result.stripeSubscriptionCanceled = false;
            return result;
        }
    }
    const recordings = await db.collection<Recording>(Collections.RECORDINGS).find({ authSubject: subject }).toArray();
    const exports = await db.collection<ExportJob>(Collections.EXPORT_JOBS).find({ authSubject: subject }).toArray();
    result.r2Failures = await removeStoredObjects([
        ...recordings.map(recording => recording.r2Key),
        ...exports.flatMap(job => job.parts.map(part => part.key)),
    ], dependencies?.removeObject || deleteFromR2);
    if (result.r2Failures.length) return result;

    // External failures leave every key in MongoDB for the cleanup cron to retry.
    await (dependencies?.removeIdentity ? dependencies.removeIdentity(user) : removeIdentity(db, user));
    const deleted = await db.collection(Collections.RECORDINGS).deleteMany({ authSubject: subject });
    result.recordingsDeleted = deleted.deletedCount;
    for (const collection of [Collections.CONTACTS, Collections.EXPORT_JOBS, Collections.SUPPORT_MESSAGES]) {
        await db.collection(collection).deleteMany({ authSubject: subject });
    }
    await db.collection(Collections.NOTIFICATIONS).deleteMany({ userId: user._id });
    await db.collection(Collections.TRANSCRIPTION_WEBHOOK_EVENTS).deleteMany({ recordingId: { $in: recordings.map(r => r._id.toString()) } });
    await db.collection(Collections.USERS).deleteOne({ authSubject: subject });
    result.cleanupPending = false;
    return result;
}

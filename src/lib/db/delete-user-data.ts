import { ObjectId, type Db } from 'mongodb';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { deleteFromR2 } from '@/lib/r2';
import { billingEnabled } from '@/lib/config';
import { removeStoredObjects } from '@/lib/storage-cleanup';
import type { ExportJob, Recording, User } from './types';
import { getTeamSettings, withTeamAccessLock } from '@/lib/team-policy';
import { IntegrationCollections } from '@/lib/integrations/database';
import { cleanupUpload, type UploadSession } from '@/lib/integrations/uploads';

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
    /** Internal admin restore path already holds the deployment access lock. */
    accessLockHeld?: boolean;
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
    if (!dependencies?.accessLockHeld) {
        return withTeamAccessLock(() => deleteUserData(subject, { ...dependencies, db, accessLockHeld: true }), db);
    }
    if ((await getTeamSettings(db)).enabled) throw new Error('Company accounts must be disabled without deleting their archive.');
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
    await db.collection(IntegrationCollections.tokens).updateMany({ owner: subject }, { $set: { revokedAt: now } });
    // Let an already claimed completion settle before deleting its archive;
    // subsequent cleanup attempts are retried by the existing account cron.
    if (await db.collection<UploadSession>(IntegrationCollections.uploads).findOne({ owner: subject, leaseUntil: { $gt: now } }) ||
        await db.collection(IntegrationCollections.jobs).findOne({ owner: subject, state: 'running', leaseUntil: { $gt: now } })) return result;
    await db.collection(IntegrationCollections.uploads).updateMany({ owner: subject, state: { $in: ['initializing', 'uploading'] } }, { $set: { state: 'cancelled', cleanupPending: true } });
    const uploads = await db.collection<UploadSession>(IntegrationCollections.uploads).find({ owner: subject }).toArray();
    for (const upload of uploads) {
        try { await cleanupUpload(upload, db); }
        catch { result.r2Failures.push(upload.stagingKey); }
    }
    if (result.r2Failures.length) return result;
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
    await db.collection(IntegrationCollections.tokens).deleteMany({ owner: subject });
    await db.collection(IntegrationCollections.jobs).deleteMany({ owner: subject });
    // Upload cleanup records survive account deletion through legacy URL expiry.
    await db.collection(Collections.NOTIFICATIONS).deleteMany({ userId: user._id });
    await db.collection(Collections.TRANSCRIPTION_WEBHOOK_EVENTS).deleteMany({ recordingId: { $in: recordings.map(r => r._id.toString()) } });
    await db.collection(Collections.USERS).deleteOne({ authSubject: subject });
    result.cleanupPending = false;
    return result;
}

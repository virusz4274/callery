import type { Db } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { User } from '@/lib/db/types';
import { checkStorageAccess, checkUserAccess } from '@/lib/access-control';
import { billingEnabled } from '@/lib/config';
import { canUseMeteredOverage } from '@/lib/access-control-common';
import { ApiError } from './contracts';
import { reserveStorageUsage, releaseStorageUsage } from '@/lib/stripe/ledger';
import { resolveFundingSource } from '@/lib/stripe/funding-source';
import { recordInternalStorageExpense } from './internal-storage-expenses';

type AccountingUser = User & { uploadReservations?: Record<string, number>; uploadReceipts?: Record<string, Date> };
export async function reserveUpload(owner: string, id: string, bytes: number, database?: Db) {
    const db = database || await getMongoDb();
    const users = db.collection<AccountingUser>(Collections.USERS);
    const user = await users.findOne({ authSubject: owner });
    if (!user || !checkUserAccess(user).allowed) throw new ApiError(403, 'account_unavailable', 'Upload access is unavailable.');
    const reserved = Object.values(user.uploadReservations || {}).reduce((sum, size) => sum + size, 0);
    const access = checkStorageAccess({ ...user, storageUsed: user.storageUsed + reserved }, bytes);
    if (!access.allowed) throw new ApiError(403, 'storage_quota_exceeded', access.reason || 'Storage quota exceeded.');
    if (billingEnabled()) {
        if (resolveFundingSource(user, true) === 'internal') await recordInternalStorageExpense(user, db);
    }
    const quota = billingEnabled() && !canUseMeteredOverage(user);
    const result = await users.updateOne({
        authSubject: owner, disabled: { $ne: true }, 'softDelete.isDeleted': { $ne: true }, teamInvitationPending: { $ne: true },
        ...(billingEnabled() ? {
            stripeSubscriptionStatus: user.stripeSubscriptionStatus ?? { $exists: false },
            billingEntitlement: user.billingEntitlement ?? { $exists: false },
            stripeMetering: user.stripeMetering ?? { $exists: false },
            stripeSubscriptionId: user.stripeSubscriptionId ?? { $exists: false },
            stripeCurrentPeriodEnd: user.stripeCurrentPeriodEnd ?? { $exists: false },
            trialEndsAt: user.trialEndsAt ?? { $exists: false },
            lifetimePurchase: user.lifetimePurchase ?? { $exists: false },
            lifetimeUsageSetup: user.lifetimeUsageSetup ?? { $exists: false },
            billingReview: user.billingReview ?? { $exists: false },
            stripePaymentIssues: user.stripePaymentIssues ?? { $exists: false },
            'billingSettings.allowOverage': user.billingSettings.allowOverage,
        } : {}),
        [`uploadReservations.${id}`]: { $exists: false }, [`uploadReceipts.${id}`]: { $exists: false },
        $expr: { $and: [
            { $lt: [{ $size: { $objectToArray: { $ifNull: ['$uploadReservations', {}] } } }, 10] },
            { $lte: [{ $add: [{ $sum: { $map: { input: { $objectToArray: { $ifNull: ['$uploadReservations', {}] } }, as: 'reservation', in: '$$reservation.v' } } }, bytes] }, 5 * 1024 ** 3] },
            ...(quota ? [{ $lte: [{ $add: [{ $ifNull: ['$storageUsed', 0] }, { $sum: { $map: { input: { $objectToArray: { $ifNull: ['$uploadReservations', {}] } }, as: 'reservation', in: '$$reservation.v' } } }, bytes] }, '$storageAllocation'] }] : []),
        ] },
    }, { $set: { [`uploadReservations.${id}`]: bytes } });
    if (result.modifiedCount) {
        if (billingEnabled() && ['subscription', 'lifetime'].includes(user.billingEntitlement?.source || '')) {
            try {
                const current = await users.findOne({ authSubject: owner });
                if (!current) throw new Error('Account unavailable.');
                await reserveStorageUsage(owner, { id, projectedStoredBytes: current.storageUsed + Object.values(current.uploadReservations || {}).reduce((sum, size) => sum + size, 0) }, db);
            } catch (error) {
                await users.updateOne({ authSubject: owner }, { $unset: { [`uploadReservations.${id}`]: '' } });
                const { PrepaidFundingRequiredError } = await import('@/lib/stripe/billing-errors');
                if (error instanceof PrepaidFundingRequiredError) throw new ApiError(402, 'prepaid_credit_required', error.message);
                throw new ApiError(503, 'billing_sync_pending', 'Usage billing is being synchronized. Retry shortly.');
            }
        }
        return;
    }
    const current = await users.findOne({ authSubject: owner });
    if (current?.uploadReservations?.[id] === bytes || current?.uploadReceipts?.[id]) return;
    throw new ApiError(409, 'upload_capacity_exceeded', 'Storage quota or the ten active upload limit was reached. Retry after completing or cancelling an upload.');
}
export async function releaseUpload(owner: string, id: string, database?: Db) {
    const db = database || await getMongoDb();
    await db.collection<AccountingUser>(Collections.USERS).updateOne({ authSubject: owner }, { $unset: { [`uploadReservations.${id}`]: '' } });
    if (billingEnabled()) await releaseStorageUsage(owner, id, db);
}
// Receipt and all user counters change in ONE atomic document update. A crash
// before the session checkpoint cannot charge the same upload twice.
export async function accountUpload(owner: string, id: string, bytes: number, duration: number, database?: Db) {
    const db = database || await getMongoDb();
    const result = await db.collection<AccountingUser>(Collections.USERS).findOneAndUpdate({ authSubject: owner, [`uploadReceipts.${id}`]: { $exists: false } }, [
        { $set: { storageUsed: { $add: [{ $ifNull: ['$storageUsed', 0] }, bytes] }, totalRecordings: { $add: [{ $ifNull: ['$totalRecordings', 0] }, 1] }, totalDuration: { $add: [{ $ifNull: ['$totalDuration', 0] }, duration] }, [`uploadReceipts.${id}`]: new Date(), updatedAt: new Date() } },
        { $set: { storagePeakUsed: { $max: [{ $cond: [{ $eq: [{ $ifNull: ['$storagePeakPeriodEnd', null] }, { $ifNull: ['$stripeCurrentPeriodEnd', null] }] }, { $ifNull: ['$storagePeakUsed', 0] }, 0] }, '$storageUsed'] }, storagePeakPeriodEnd: { $ifNull: ['$stripeCurrentPeriodEnd', null] } } },
        { $unset: `uploadReservations.${id}` },
    ], { returnDocument: 'after' });
    const current = result || await db.collection<AccountingUser>(Collections.USERS).findOne({ authSubject: owner });
    if (billingEnabled() && current) await recordInternalStorageExpense(current, db);
    return current;
}

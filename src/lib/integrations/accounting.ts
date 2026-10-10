import type { Db } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { User } from '@/lib/db/types';
import { checkStorageAccess, checkUserAccess } from '@/lib/access-control';
import { billingEnabled } from '@/lib/config';
import { ApiError } from './contracts';

type AccountingUser = User & { uploadReservations?: Record<string, number>; uploadReceipts?: Record<string, Date> };
export async function reserveUpload(owner: string, id: string, bytes: number, database?: Db) {
    const db = database || await getMongoDb();
    const users = db.collection<AccountingUser>(Collections.USERS);
    const user = await users.findOne({ authSubject: owner });
    if (!user || !checkUserAccess(user).allowed) throw new ApiError(403, 'account_unavailable', 'Upload access is unavailable.');
    const reserved = Object.values(user.uploadReservations || {}).reduce((sum, size) => sum + size, 0);
    const access = checkStorageAccess({ ...user, storageUsed: user.storageUsed + reserved }, bytes);
    if (!access.allowed) throw new ApiError(403, 'storage_quota_exceeded', access.reason || 'Storage quota exceeded.');
    const quota = billingEnabled() && (user.planKey === 'free-trial' || !user.billingSettings.allowOverage);
    const result = await users.updateOne({
        authSubject: owner, disabled: { $ne: true }, 'softDelete.isDeleted': { $ne: true }, teamInvitationPending: { $ne: true },
        [`uploadReservations.${id}`]: { $exists: false }, [`uploadReceipts.${id}`]: { $exists: false },
        $expr: { $and: [
            { $lt: [{ $size: { $objectToArray: { $ifNull: ['$uploadReservations', {}] } } }, 10] },
            ...(quota ? [{ $lte: [{ $add: [{ $ifNull: ['$storageUsed', 0] }, { $sum: { $map: { input: { $objectToArray: { $ifNull: ['$uploadReservations', {}] } }, as: 'reservation', in: '$$reservation.v' } } }, bytes] }, '$storageAllocation'] }] : []),
        ] },
    }, { $set: { [`uploadReservations.${id}`]: bytes } });
    if (result.modifiedCount) return;
    const current = await users.findOne({ authSubject: owner });
    if (current?.uploadReservations?.[id] === bytes || current?.uploadReceipts?.[id]) return;
    throw new ApiError(409, 'upload_capacity_exceeded', 'Storage quota or the ten active upload limit was reached. Retry after completing or cancelling an upload.');
}
export async function releaseUpload(owner: string, id: string, database?: Db) {
    await (database || await getMongoDb()).collection<AccountingUser>(Collections.USERS).updateOne({ authSubject: owner }, { $unset: { [`uploadReservations.${id}`]: '' } });
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
    return result || await db.collection<AccountingUser>(Collections.USERS).findOne({ authSubject: owner });
}

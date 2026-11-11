import type { Db, ObjectId } from 'mongodb';
import { Collections } from '@/lib/mongodb';
import type { PushSubscriptionEntry, User } from '@/lib/db/types';

function activeOwner(authSubject: string) {
    return { authSubject, disabled: { $ne: true }, 'softDelete.isDeleted': { $ne: true }, teamInvitationPending: { $ne: true } };
}

/** Replace this endpoint atomically without overwriting another device's changes. */
export async function savePushSubscription(authSubject: string, subscription: PushSubscriptionEntry, db: Db): Promise<boolean> {
    const result = await db.collection<User>(Collections.USERS).updateOne(activeOwner(authSubject), [{
        $set: {
            pushSubscriptions: { $concatArrays: [
                { $filter: { input: { $ifNull: ['$pushSubscriptions', []] }, as: 'subscription',
                    cond: { $ne: ['$$subscription.endpoint', { $literal: subscription.endpoint }] } } },
                { $literal: [subscription] },
            ] },
            updatedAt: { $literal: new Date() },
        },
    }]);
    return result.matchedCount === 1;
}

export async function removePushSubscription(authSubject: string, endpoint: string, db: Db): Promise<boolean> {
    const result = await db.collection<User>(Collections.USERS).updateOne(activeOwner(authSubject), {
        $pull: { pushSubscriptions: { endpoint } }, $set: { updatedAt: new Date() },
    });
    return result.matchedCount === 1;
}

/** A delayed delivery failure must not remove refreshed credentials for this endpoint. */
export async function prunePushSubscription(userId: ObjectId, subscription: PushSubscriptionEntry, db: Db): Promise<void> {
    await db.collection<User>(Collections.USERS).updateOne({ _id: userId }, {
        $pull: { pushSubscriptions: {
            type: 'web', endpoint: subscription.endpoint,
            'keys.p256dh': subscription.keys.p256dh, 'keys.auth': subscription.keys.auth,
        } },
    });
}

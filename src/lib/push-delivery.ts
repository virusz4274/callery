import type { Db, ObjectId } from 'mongodb';
import { Collections } from '@/lib/mongodb';
import type { User } from '@/lib/db/types';
import { checkUserAccess } from '@/lib/access-control-common';
import { sendWebPushNotification, type WebPushPayload } from '@/lib/web-push';
import { prunePushSubscription } from '@/lib/push-subscriptions';
import { logger } from '@/lib/logger';

/** Browser delivery is best effort; saved in-app notifications remain authoritative. */
export async function deliverUserPushNotification(userId: ObjectId, payload: WebPushPayload, db: Db): Promise<void> {
    const user = await db.collection<User>(Collections.USERS).findOne({ _id: userId });
    if (!user || !checkUserAccess(user).allowed) return;
    const subscriptions = user.pushSubscriptions?.filter(subscription => subscription.type === 'web') || [];
    const results = await Promise.allSettled(subscriptions.map(async subscription => {
        const result = await sendWebPushNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, payload);
        if (!result.success && (result.statusCode === 404 || result.statusCode === 410)) {
            await prunePushSubscription(userId, subscription, db);
        }
    }));
    const failed = results.filter(result => result.status === 'rejected').length;
    if (failed) logger.warn(`[Push] ${failed} browser delivery or subscription cleanup attempts failed.`);
}

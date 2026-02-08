import { ObjectId } from 'mongodb';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { Notification, NotificationResponse, User } from '@/lib/db/types';
import { sendWebPushNotification } from '@/lib/web-push';

/**
 * Create a new in-app notification for a user.
 */
export async function createNotification(
    userId: ObjectId,
    type: 'info' | 'success' | 'warning' | 'error',
    title: string,
    message: string,
    link?: string
): Promise<void> {
    const db = await getMongoDb();

    const notification: Notification = {
        _id: new ObjectId(),
        userId,
        type,
        title,
        message,
        link,
        isRead: false,
        createdAt: new Date(),
    };

    await db.collection<Notification>(Collections.NOTIFICATIONS).insertOne(notification);

    // Send Web Push notifications if user has subscriptions
    try {
        const user = await db.collection<User>(Collections.USERS).findOne({ _id: userId });
        if (user?.pushSubscriptions && user.pushSubscriptions.length > 0) {
            const pushPayload = {
                title,
                body: message,
                icon: '/icons/android-chrome-192x192.png',
                url: link || '/',
            };

            const pushPromises = user.pushSubscriptions.map(async (sub) => {
                if (sub.type === 'web') {
                    return sendWebPushNotification(
                        {
                            endpoint: sub.endpoint,
                            keys: sub.keys,
                        },
                        pushPayload
                    );
                }
                return { success: true, endpoint: sub.endpoint };
            });

            const results = await Promise.allSettled(pushPromises);

            // Log any failures (but don't remove subscriptions automatically here)
            results.forEach((result, index) => {
                if (result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.success)) {
                    console.warn('[Push] Failed to send to:', user.pushSubscriptions?.[index]?.endpoint);
                }
            });
        }
    } catch (pushError) {
        console.error('[Push] Error sending push notifications:', pushError);
        // Don't throw - in-app notification was saved successfully
    }
}

/**
 * Get notifications for a user.
 * Returns unread notifications + up to 10 recent read notifications.
 */
export async function getNotifications(userId: ObjectId, limit: number = 20): Promise<NotificationResponse[]> {
    const db = await getMongoDb();

    // Fetch unread notifications
    const unread = await db.collection<Notification>(Collections.NOTIFICATIONS)
        .find({ userId, isRead: false })
        .sort({ createdAt: -1 })
        .toArray();

    // Fetch recent read notifications if we haven't hit the limit
    let recentRead: Notification[] = [];
    if (unread.length < limit) {
        recentRead = await db.collection<Notification>(Collections.NOTIFICATIONS)
            .find({ userId, isRead: true })
            .sort({ createdAt: -1 })
            .limit(limit - unread.length)
            .toArray();
    }

    const all = [...unread, ...recentRead].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return all.map(n => ({
        id: n._id.toString(),
        type: n.type,
        title: n.title,
        message: n.message,
        isRead: n.isRead,
        link: n.link,
        createdAt: n.createdAt.toISOString(),
    }));
}

/**
 * Mark a specific notification as read.
 */
export async function markAsRead(notificationId: string, userId: ObjectId): Promise<void> {
    const db = await getMongoDb();
    await db.collection<Notification>(Collections.NOTIFICATIONS).updateOne(
        { _id: new ObjectId(notificationId), userId },
        { $set: { isRead: true } }
    );
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllAsRead(userId: ObjectId): Promise<void> {
    const db = await getMongoDb();
    await db.collection<Notification>(Collections.NOTIFICATIONS).updateMany(
        { userId, isRead: false },
        { $set: { isRead: true } }
    );
}
/**
 * Delete all notifications for a user.
 */
export async function deleteAllNotifications(userId: ObjectId): Promise<void> {
    const db = await getMongoDb();
    await db.collection<Notification>(Collections.NOTIFICATIONS).deleteMany({ userId });
}

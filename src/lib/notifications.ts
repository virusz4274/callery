import { MongoServerError, ObjectId } from 'mongodb';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { Notification, NotificationResponse } from '@/lib/db/types';
import { deliverUserPushNotification } from '@/lib/push-delivery';
import { normalizeNotificationLink } from '@/lib/notification-links';
import { logger } from '@/lib/logger';
import { NOTIFICATION_MAX_PAGE_SIZE, NOTIFICATION_PAGE_SIZE, type NotificationPage, type NotificationPageOptions } from '@/lib/notification-pagination';

/**
 * Create a new in-app notification for a user.
 */
export async function createNotification(
    userId: ObjectId,
    type: 'info' | 'success' | 'warning' | 'error',
    title: string,
    message: string,
    link?: string,
    options?: { eventKey: string },
): Promise<void> {
    const db = await getMongoDb();
    const normalizedLink = normalizeNotificationLink(link);

    const notification: Notification = {
        _id: new ObjectId(),
        userId,
        type,
        title,
        message,
        link: normalizedLink,
        isRead: false,
        createdAt: new Date(),
        ...(options ? { eventKey: options.eventKey } : {}),
    };

    try { await db.collection<Notification>(Collections.NOTIFICATIONS).insertOne(notification); }
    catch (error) {
        // Only an existing identical event is a successful duplicate. Other
        // uniqueness failures must remain visible rather than hiding lost mail.
        if (options && error instanceof MongoServerError && error.code === 11000
            && await db.collection<Notification>(Collections.NOTIFICATIONS).findOne({ userId, eventKey: options.eventKey })) return;
        throw error;
    }

    // Browser delivery and expired-device cleanup cannot undo a saved notice.
    try {
        await deliverUserPushNotification(userId, {
            title, body: message, icon: '/icons/callery/android-chrome-192x192.png', url: normalizedLink || '/',
        }, db);
    } catch (pushError) {
        logger.error('[Push] Error sending push notifications:', pushError);
        // Don't throw - in-app notification was saved successfully
    }
}

/** Read one bounded history page, with a separate count for all unread items. */
export async function getNotifications(userId: ObjectId, options: NotificationPageOptions = {}): Promise<NotificationPage> {
    if (!options || typeof options !== 'object' || Array.isArray(options)
        || Object.keys(options).some(key => key !== 'limit' && key !== 'cursor')) throw new Error('Invalid notification page options.');
    const limit = options.limit === undefined ? NOTIFICATION_PAGE_SIZE : options.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > NOTIFICATION_MAX_PAGE_SIZE) throw new Error('Invalid notification page size.');
    let before: { createdAt: Date; id: ObjectId } | undefined;
    if (options.cursor !== undefined) {
        if (typeof options.cursor !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z_[a-f0-9]{24}$/.test(options.cursor)) throw new Error('Invalid notification cursor.');
        const timestamp = options.cursor.slice(0, 24);
        const createdAt = new Date(timestamp);
        if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== timestamp) throw new Error('Invalid notification cursor.');
        before = { createdAt, id: new ObjectId(options.cursor.slice(25)) };
    }
    const db = await getMongoDb();
    const collection = db.collection<Notification>(Collections.NOTIFICATIONS);
    const [rows, unreadCount] = await Promise.all([
        collection.find({ userId, ...(before ? { $or: [
            { createdAt: { $lt: before.createdAt } },
            { createdAt: before.createdAt, _id: { $lt: before.id } },
        ] } : {}) }).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).toArray(),
        collection.countDocuments({ userId, isRead: false }),
    ]);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const notifications: NotificationResponse[] = page.map(n => ({
        id: n._id.toString(),
        type: n.type,
        title: n.title,
        message: n.message,
        isRead: n.isRead,
        link: normalizeNotificationLink(n.link),
        createdAt: n.createdAt.toISOString(),
    }));
    return {
        notifications,
        unreadCount,
        nextCursor: rows.length > limit && last ? `${last.createdAt.toISOString()}_${last._id.toHexString()}` : null,
    };
}

/**
 * Mark a specific notification as read.
 */
export async function markAsRead(notificationId: string, userId: ObjectId): Promise<void> {
    if (typeof notificationId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(notificationId)) throw new Error('Invalid notification ID.');
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

'use server';

import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { findUserByAuthSubject } from '@/lib/db/users';
import { getNotifications, markAsRead, markAllAsRead, createNotification, deleteAllNotifications } from '@/lib/notifications';
import type { NotificationPage, NotificationPageOptions } from '@/lib/notification-pagination';

/**
 * Fetch notifications for the current user.
 */
export async function fetchNotifications(options: NotificationPageOptions = {}): Promise<NotificationPage> {
    const authSubject = await getAuthSubjectFromSession();
    if (!authSubject) return { notifications: [], unreadCount: 0, nextCursor: null };

    const user = await findUserByAuthSubject(authSubject);
    if (!user) return { notifications: [], unreadCount: 0, nextCursor: null };

    return getNotifications(user._id, options);
}

/**
 * Mark a notification as read.
 */
export async function readNotification(id: string) {
    const authSubject = await getAuthSubjectFromSession();
    if (!authSubject) return;

    const user = await findUserByAuthSubject(authSubject);
    if (!user) return;

    await markAsRead(id, user._id);
}

/**
 * Mark all notifications as read.
 */
export async function readAllNotifications() {
    const authSubject = await getAuthSubjectFromSession();
    if (!authSubject) return;

    const user = await findUserByAuthSubject(authSubject);
    if (!user) return;

    await markAllAsRead(user._id);
}

/**
 * Delete all notifications (Clear History).
 */
export async function clearAllNotifications() {
    const authSubject = await getAuthSubjectFromSession();
    if (!authSubject) return;

    const user = await findUserByAuthSubject(authSubject);
    if (!user) return;

    await deleteAllNotifications(user._id);
}

/**
 * Create a test notification (For dev/testing only)
 */
export async function sendTestNotification() {
    const authSubject = await getAuthSubjectFromSession();
    if (!authSubject) return;

    const user = await findUserByAuthSubject(authSubject);
    if (!user) return;

    await createNotification(
        user._id,
        'info',
        'Test Notification',
        'This is a test notification triggered manually.',
        '/settings'
    );
}

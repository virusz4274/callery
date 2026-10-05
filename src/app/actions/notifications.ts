'use server';

import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { findUserByAuthSubject } from '@/lib/db/users';
import { getNotifications, markAsRead, markAllAsRead, createNotification, deleteAllNotifications } from '@/lib/notifications';

/**
 * Fetch notifications for the current user.
 */
export async function fetchNotifications() {
    const authSubject = await getAuthSubjectFromSession();
    if (!authSubject) return [];

    const user = await findUserByAuthSubject(authSubject);
    if (!user) return [];

    return getNotifications(user._id);
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

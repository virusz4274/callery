'use server';

import { getFirebaseUidFromSession } from '@/lib/auth-utils';
import { findUserByFirebaseUid } from '@/lib/db/users';
import { getNotifications, markAsRead, markAllAsRead, createNotification, deleteAllNotifications } from '@/lib/notifications';

/**
 * Fetch notifications for the current user.
 */
export async function fetchNotifications() {
    const firebaseUid = await getFirebaseUidFromSession();
    if (!firebaseUid) return [];

    const user = await findUserByFirebaseUid(firebaseUid);
    if (!user) return [];

    return getNotifications(user._id);
}

/**
 * Mark a notification as read.
 */
export async function readNotification(id: string) {
    const firebaseUid = await getFirebaseUidFromSession();
    if (!firebaseUid) return;

    const user = await findUserByFirebaseUid(firebaseUid);
    if (!user) return;

    await markAsRead(id, user._id);
}

/**
 * Mark all notifications as read.
 */
export async function readAllNotifications() {
    const firebaseUid = await getFirebaseUidFromSession();
    if (!firebaseUid) return;

    const user = await findUserByFirebaseUid(firebaseUid);
    if (!user) return;

    await markAllAsRead(user._id);
}

/**
 * Delete all notifications (Clear History).
 */
export async function clearAllNotifications() {
    const firebaseUid = await getFirebaseUidFromSession();
    if (!firebaseUid) return;

    const user = await findUserByFirebaseUid(firebaseUid);
    if (!user) return;

    await deleteAllNotifications(user._id);
}

/**
 * Create a test notification (For dev/testing only)
 */
export async function sendTestNotification() {
    const firebaseUid = await getFirebaseUidFromSession();
    if (!firebaseUid) return;

    const user = await findUserByFirebaseUid(firebaseUid);
    if (!user) return;

    await createNotification(
        user._id,
        'info',
        'Test Notification',
        'This is a test notification triggered manually.',
        '/settings'
    );
}

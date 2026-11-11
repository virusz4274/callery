import type { NotificationResponse } from './db/types';

export interface NotificationPageOptions {
    limit?: number;
    cursor?: string;
}

export interface NotificationPage {
    notifications: NotificationResponse[];
    unreadCount: number;
    nextCursor: string | null;
}

export const NOTIFICATION_PAGE_SIZE = 20;
export const NOTIFICATION_MAX_PAGE_SIZE = 100;

export function compareNotificationOrder(a: Pick<NotificationResponse, 'id' | 'createdAt'>, b: Pick<NotificationResponse, 'id' | 'createdAt'>): number {
    return Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id);
}

/** Fresh copies replace existing rows; already loaded history remains visible. */
export function mergeNotificationHistory(current: NotificationResponse[], incoming: NotificationResponse[]): NotificationResponse[] {
    const rows = new Map(current.map(item => [item.id, item]));
    for (const item of incoming) rows.set(item.id, item);
    return [...rows.values()].sort(compareNotificationOrder);
}

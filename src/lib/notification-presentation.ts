import type { NotificationResponse } from './db/types';
import { normalizeNotificationLink } from './notification-links';

export function observeNotifications(items: NotificationResponse[], seen?: ReadonlySet<string>) {
    const nextSeen = new Set(seen);
    const newUnread = items.filter((item) => {
        const isNew = seen !== undefined && !nextSeen.has(item.id) && !item.isRead;
        nextSeen.add(item.id);
        return isNew;
    });
    return { seen: nextSeen, newUnread };
}

export function getNotificationActionLabel(link: string): string {
    const normalized = normalizeNotificationLink(link);
    if (!normalized) return 'Open page';
    const url = new URL(normalized, 'https://notification.invalid');
    if (url.pathname === '/recordings' && url.searchParams.has('id')) return 'Open recording';
    if (url.pathname === '/settings') {
        return url.searchParams.get('tab') === 'billing' ? 'View billing' : 'View settings';
    }
    return 'Open page';
}

export function getNotificationTimestamp(createdAt: string, now = Date.now(), locale = 'en') {
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return { relative: 'Date unavailable', absolute: 'Date unavailable' };
    const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
    const relative = seconds < 60 ? 'Just now'
        : seconds < 3600 ? formatter.format(-Math.floor(seconds / 60), 'minute')
        : seconds < 86400 ? formatter.format(-Math.floor(seconds / 3600), 'hour')
        : seconds < 604800 ? formatter.format(-Math.floor(seconds / 86400), 'day')
        : new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
    return { relative, absolute: date.toLocaleString(locale) };
}

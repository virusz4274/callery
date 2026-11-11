"use client";

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Popover, Spinner } from '@heroui/react';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { clearAllNotifications, fetchNotifications, readAllNotifications, readNotification } from '@/app/actions/notifications';
import { useToast } from '@/components/toast-provider';
import type { NotificationResponse } from '@/lib/db/types';
import { observeNotifications } from '@/lib/notification-presentation';
import { compareNotificationOrder, mergeNotificationHistory, type NotificationPage } from '@/lib/notification-pagination';
import { useUser } from '@/lib/auth/client';
import { NotificationItem } from './notification-item';

export function NotificationCenter() {
    const { user } = useUser();
    return user ? <UserNotificationCenter key={user.id} /> : null;
}

function UserNotificationCenter() {
    const [isOpen, setIsOpen] = useState(false);
    const [history, setHistory] = useState<NotificationPage>({ notifications: [], unreadCount: 0, nextCursor: null });
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingOlder, setIsLoadingOlder] = useState(false);
    const [error, setError] = useState<'newest' | 'older' | null>(null);
    const [pendingAction, setPendingAction] = useState<string | null>(null);
    const historyRef = useRef(history);
    const openRef = useRef(false);
    const pendingRef = useRef<string | null>(null);
    const fetchingRef = useRef(false);
    const seenIds = useRef<Set<string> | undefined>(undefined);
    const newestSeen = useRef<NotificationResponse | undefined>(undefined);
    const requestVersion = useRef(0);
    const { toast } = useToast();
    const { notifications, unreadCount, nextCursor } = history;
    const publish = useCallback((value: NotificationPage) => {
        historyRef.current = value;
        setHistory(value);
    }, []);

    const loadNotifications = useCallback(async (announce = true, cursor?: string) => {
        if (pendingRef.current || fetchingRef.current) return;
        const version = ++requestVersion.current;
        fetchingRef.current = true;
        if (cursor) setIsLoadingOlder(true);
        else setIsLoading(true);
        try {
            const page = await fetchNotifications(cursor ? { cursor } : {});
            if (version !== requestVersion.current) return;
            const previous = historyRef.current;
            const observed = observeNotifications(page.notifications, seenIds.current);
            seenIds.current = observed.seen;
            // Older pages and late historical rows are never new-arrival alerts.
            const arrivals = cursor ? [] : observed.newUnread.filter(item => !newestSeen.current || compareNotificationOrder(item, newestSeen.current) < 0);
            if (!cursor && page.notifications[0] && (!newestSeen.current || compareNotificationOrder(page.notifications[0], newestSeen.current) < 0)) {
                newestSeen.current = page.notifications[0];
            }
            const completeHistory = !cursor && !page.nextCursor;
            const gapBeforeHistory = !cursor && previous.notifications.length > 0
                && !page.notifications.some(item => item.id === previous.notifications[0].id);
            const merged = completeHistory ? page.notifications : mergeNotificationHistory(previous.notifications, page.notifications);
            publish({
                notifications: page.unreadCount === 0 ? merged.map(item => ({ ...item, isRead: true })) : merged,
                unreadCount: page.unreadCount,
                nextCursor: cursor || completeHistory || previous.notifications.length === 0 || gapBeforeHistory ? page.nextCursor : previous.nextCursor,
            });
            setError(null);
            if (announce && !openRef.current && arrivals.length > 0) {
                const statusMap = { info: 'default', success: 'success', warning: 'warning', error: 'danger' } as const;
                toast(arrivals.length === 1
                    ? { title: arrivals[0].title, status: statusMap[arrivals[0].type] }
                    : { title: `${arrivals.length} new notifications`, status: 'default' });
            }
        } catch (loadError) {
            if (version !== requestVersion.current) return;
            console.error('Failed to load notifications', loadError);
            setError(cursor ? 'older' : 'newest');
        } finally {
            if (version === requestVersion.current) {
                fetchingRef.current = false;
                setIsLoading(false);
                setIsLoadingOlder(false);
            }
        }
    }, [publish, toast]);

    useEffect(() => {
        const requests = requestVersion;
        const fetching = fetchingRef;
        const initialLoadTimer = setTimeout(() => { void loadNotifications(false); }, 0);
        const interval = setInterval(() => { void loadNotifications(); }, 60000);
        return () => {
            clearTimeout(initialLoadTimer);
            clearInterval(interval);
            requests.current++;
            fetching.current = false;
        };
    }, [loadNotifications]);

    const handleOpenChange = (open: boolean) => {
        openRef.current = open;
        setIsOpen(open);
        if (open) void loadNotifications(false);
    };

    const updateNotifications = async (action: string, optimistic: NotificationPage, save: () => Promise<void>) => {
        if (pendingRef.current) return;
        const previous = historyRef.current;
        pendingRef.current = action;
        const version = ++requestVersion.current;
        fetchingRef.current = false;
        setIsLoading(false);
        setIsLoadingOlder(false);
        setPendingAction(action);
        publish(optimistic);
        try {
            await save();
        } catch (saveError) {
            if (version !== requestVersion.current) return;
            console.error('Notification update failed', saveError);
            publish(previous);
            toast({ title: 'Could not update notifications', description: 'Please try again.', status: 'danger' });
        } finally {
            if (version === requestVersion.current) {
                pendingRef.current = null;
                setPendingAction(null);
                await loadNotifications(false);
            }
        }
    };

    const handleRead = (id: string) => {
        const current = historyRef.current;
        if (!current.notifications.some(item => item.id === id && !item.isRead)) return;
        void updateNotifications(id, {
            ...current, unreadCount: Math.max(0, current.unreadCount - 1),
            notifications: current.notifications.map(item => item.id === id ? { ...item, isRead: true } : item),
        }, () => readNotification(id));
    };

    return (
        <Popover isOpen={isOpen} onOpenChange={handleOpenChange}>
            <Badge.Anchor>
                <Button variant="ghost" isIconOnly className="size-11 rounded-lg" aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}>
                    <Bell className="size-5 text-muted" aria-hidden="true" />
                </Button>
                {unreadCount > 0 && <Badge color="danger" size="sm" className="border-2 border-background">{unreadCount > 9 ? '9+' : unreadCount}</Badge>}
            </Badge.Anchor>
            <Popover.Content className="w-[380px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-border bg-overlay p-0 shadow-overlay" placement="bottom end">
                <Popover.Dialog className="flex max-h-[min(560px,calc(100dvh-6rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] min-h-0 flex-col">
                    <header className="shrink-0 border-b border-border px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <Popover.Heading className="text-base font-semibold">Notifications</Popover.Heading>
                            {unreadCount > 0 && <span className="text-sm text-muted" aria-live="polite">{unreadCount} unread</span>}
                        </div>
                        {(notifications.length > 0 || pendingAction === 'clear-all') && <div className="mt-2 flex flex-wrap gap-2">
                            {(unreadCount > 0 || pendingAction === 'read-all') && <Button size="sm" variant="ghost" className="min-h-11 gap-2 px-2" isDisabled={pendingAction !== null} isPending={pendingAction === 'read-all'}
                                onPress={() => void updateNotifications('read-all', { ...history, unreadCount: 0, notifications: notifications.map(item => ({ ...item, isRead: true })) }, readAllNotifications)}>
                                <CheckCheck className="size-4" aria-hidden="true" />Mark all read
                            </Button>}
                            <Button size="sm" variant="ghost" className="min-h-11 gap-2 px-2 text-muted" isDisabled={pendingAction !== null} isPending={pendingAction === 'clear-all'}
                                onPress={() => void updateNotifications('clear-all', { notifications: [], unreadCount: 0, nextCursor: null }, clearAllNotifications)}>
                                <Trash2 className="size-4" aria-hidden="true" />Clear list
                            </Button>
                        </div>}
                    </header>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                        {error && <div role="alert" className="m-3 rounded-lg border border-danger/20 p-3 text-sm">
                            <p>{error === 'older' ? 'Could not load older notifications.' : 'Could not load notifications.'}</p>
                            <Button variant="ghost" className="mt-1 min-h-11" onPress={() => void loadNotifications(false, error === 'older' ? nextCursor || undefined : undefined)} isPending={isLoading || isLoadingOlder} isDisabled={pendingAction !== null}>Retry</Button>
                        </div>}
                        {notifications.length === 0
                            ? pendingAction === 'clear-all' ? <div role="status" className="p-8 text-center text-sm text-muted">Clearing notifications</div>
                                : isLoading ? <div role="status" className="flex items-center justify-center gap-2 p-8 text-sm text-muted"><Spinner size="sm" />Loading notifications</div>
                                : !error && <div className="flex flex-col items-center gap-3 p-8 text-center text-muted"><Bell className="size-6" aria-hidden="true" /><p className="text-sm">No notifications</p></div>
                            : <ul className="flex flex-col gap-2 p-3" aria-label="Notifications">
                                {notifications.map((notification) => <NotificationItem key={notification.id} notification={notification}
                                    isDisabled={pendingAction !== null} isPending={pendingAction === notification.id} onRead={handleRead}
                                    onNavigate={() => handleOpenChange(false)} />)}
                            </ul>}
                        {nextCursor && <div className="px-3 pb-3"><Button variant="secondary" className="min-h-11 w-full" isPending={isLoadingOlder}
                            isDisabled={pendingAction !== null || isLoading || isLoadingOlder} onPress={() => void loadNotifications(false, nextCursor)}>Load older notifications</Button></div>}
                    </div>
                    <footer className="shrink-0 border-t border-border px-4 py-1">
                        <Link href="/settings?tab=notifications" onClick={() => handleOpenChange(false)} className="inline-flex min-h-11 items-center rounded-lg text-sm text-accent hover:underline">Notification settings</Link>
                    </footer>
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
    );
}

"use client";

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Popover, Spinner } from '@heroui/react';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { clearAllNotifications, fetchNotifications, readAllNotifications, readNotification } from '@/app/actions/notifications';
import { useToast } from '@/components/toast-provider';
import type { NotificationResponse } from '@/lib/db/types';
import { observeNotifications } from '@/lib/notification-presentation';
import { NotificationItem } from './notification-item';

export function NotificationCenter() {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);
    const [pendingAction, setPendingAction] = useState<string | null>(null);
    const openRef = useRef(false);
    const pendingRef = useRef<string | null>(null);
    const seenIds = useRef<Set<string> | undefined>(undefined);
    const requestVersion = useRef(0);
    const { toast } = useToast();
    const unreadCount = notifications.filter((item) => !item.isRead).length;

    const loadNotifications = useCallback(async (announce = true) => {
        if (pendingRef.current) return;
        const version = ++requestVersion.current;
        setIsLoading(true);
        try {
            const data = await fetchNotifications();
            if (version !== requestVersion.current) return;
            const observed = observeNotifications(data, seenIds.current);
            seenIds.current = observed.seen;
            setNotifications(data);
            setError(false);
            if (announce && !openRef.current && observed.newUnread.length > 0) {
                const statusMap = { info: 'default', success: 'success', warning: 'warning', error: 'danger' } as const;
                const item = observed.newUnread[0];
                toast(observed.newUnread.length === 1
                    ? { title: item.title, status: statusMap[item.type] }
                    : { title: `${observed.newUnread.length} new notifications`, status: 'default' });
            }
        } catch (loadError) {
            if (version !== requestVersion.current) return;
            console.error('Failed to load notifications', loadError);
            setError(true);
        } finally {
            if (version === requestVersion.current) setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        const requests = requestVersion;
        const initialLoadTimer = setTimeout(() => { void loadNotifications(false); }, 0);
        const interval = setInterval(() => { void loadNotifications(); }, 60000);
        return () => {
            clearTimeout(initialLoadTimer);
            clearInterval(interval);
            requests.current++;
        };
    }, [loadNotifications]);

    const handleOpenChange = (open: boolean) => {
        openRef.current = open;
        setIsOpen(open);
        if (open) void loadNotifications(false);
    };

    const updateNotifications = async (action: string, optimistic: NotificationResponse[], save: () => Promise<void>) => {
        if (pendingRef.current) return;
        const previous = notifications;
        pendingRef.current = action;
        requestVersion.current++;
        setIsLoading(false);
        setPendingAction(action);
        setNotifications(optimistic);
        try {
            await save();
        } catch (saveError) {
            console.error('Notification update failed', saveError);
            setNotifications(previous);
            toast({ title: 'Could not update notifications', description: 'Please try again.', status: 'danger' });
        } finally {
            pendingRef.current = null;
            setPendingAction(null);
            await loadNotifications(false);
        }
    };

    const handleRead = (id: string) => {
        if (!notifications.some((item) => item.id === id && !item.isRead)) return;
        void updateNotifications(id, notifications.map((item) => item.id === id ? { ...item, isRead: true } : item), () => readNotification(id));
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
                                onPress={() => void updateNotifications('read-all', notifications.map((item) => ({ ...item, isRead: true })), readAllNotifications)}>
                                <CheckCheck className="size-4" aria-hidden="true" />Mark all read
                            </Button>}
                            <Button size="sm" variant="ghost" className="min-h-11 gap-2 px-2 text-muted" isDisabled={pendingAction !== null} isPending={pendingAction === 'clear-all'}
                                onPress={() => void updateNotifications('clear-all', [], clearAllNotifications)}>
                                <Trash2 className="size-4" aria-hidden="true" />Clear list
                            </Button>
                        </div>}
                    </header>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                        {error && <div role="alert" className="m-3 rounded-lg border border-danger/20 p-3 text-sm">
                            <p>Could not load notifications.</p>
                            <Button variant="ghost" className="mt-1 min-h-11" onPress={() => void loadNotifications(false)} isPending={isLoading} isDisabled={pendingAction !== null}>Retry</Button>
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
                    </div>
                    <footer className="shrink-0 border-t border-border px-4 py-1">
                        <Link href="/settings?tab=notifications" onClick={() => handleOpenChange(false)} className="inline-flex min-h-11 items-center rounded-lg text-sm text-accent hover:underline">Notification settings</Link>
                    </footer>
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
    );
}

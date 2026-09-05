"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Chip, Popover } from '@heroui/react';
import { Bell, CheckCheck, Plus, Trash2 } from 'lucide-react';
import {
    clearAllNotifications,
    fetchNotifications,
    readAllNotifications,
    readNotification,
    sendTestNotification,
} from '@/app/actions/notifications';
import { useToast } from '@/components/toast-provider';
import { NotificationResponse } from '@/lib/db/types';
import { EnablePushButton } from './enable-push-button';
import { NotificationItem } from './notification-item';

export function NotificationCenter() {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const lastUnreadCount = useRef(0);
    const { toast } = useToast();

    const loadNotifications = useCallback(async (isInitial = false) => {
        try {
            const data = await fetchNotifications();
            setNotifications(data);

            const newUnreadCount = data.filter((item) => !item.isRead).length;

            if (!isInitial && newUnreadCount > lastUnreadCount.current) {
                const diff = newUnreadCount - lastUnreadCount.current;
                const newItems = data.filter((item) => !item.isRead).slice(0, diff);

                newItems.forEach((item) => {
                    const statusMap: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
                        info: 'default',
                        success: 'success',
                        warning: 'warning',
                        error: 'danger',
                    };

                    toast({
                        title: item.title,
                        description: item.message,
                        status: statusMap[item.type] || 'default',
                    });
                });
            }

            setUnreadCount(newUnreadCount);
            lastUnreadCount.current = newUnreadCount;
        } catch (error) {
            console.error('Failed to load notifications', error);
        }
    }, [toast]);

    useEffect(() => {
        const initialLoadTimer = setTimeout(() => {
            void loadNotifications(true);
        }, 0);

        const interval = setInterval(() => {
            void loadNotifications(false);
        }, 60000);

        return () => {
            clearTimeout(initialLoadTimer);
            clearInterval(interval);
        };
    }, [loadNotifications]);

    const handleRead = async (id: string) => {
        setNotifications((prev) => prev.map((item) => item.id === id ? { ...item, isRead: true } : item));
        setUnreadCount((prev) => Math.max(0, prev - 1));
        await readNotification(id);
    };

    const handleReadAll = async () => {
        setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
        setUnreadCount(0);
        try {
            await readAllNotifications();
            await loadNotifications();
        } catch (error) {
            console.error('Mark all as read failed', error);
            await loadNotifications();
        }
    };

    const handleClearAll = async () => {
        setNotifications([]);
        setUnreadCount(0);
        try {
            await clearAllNotifications();
            await loadNotifications();
        } catch (error) {
            console.error('Clear all failed', error);
            await loadNotifications();
        }
    };

    const handleTest = async () => {
        setIsLoading(true);
        await sendTestNotification();
        await loadNotifications();
        setIsLoading(false);
    };

    return (
        <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
            <Popover.Trigger>
                <Badge.Anchor>
                    <Button variant="ghost" isIconOnly className="rounded-full" aria-label="Notifications">
                        <Bell className="size-5 text-default-500" />
                    </Button>
                    {unreadCount > 0 ? (
                        <Badge color="danger" size="sm" className="border-2 border-background">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </Badge>
                    ) : null}
                </Badge.Anchor>
            </Popover.Trigger>
            <Popover.Content className="w-[380px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/98 p-0 shadow-[0_24px_64px_-44px_rgba(15,23,42,0.45)]" placement="bottom end">
                <Popover.Dialog className="flex max-h-[560px] flex-col">
                    <div className="border-b border-default-100/80 bg-background/90 px-4 py-4 backdrop-blur-md">
                        <div className="flex items-start justify-between gap-3">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <Popover.Heading className="text-sm font-semibold tracking-[-0.02em]">Notifications</Popover.Heading>
                                    <Chip size="sm" variant="soft" color={unreadCount > 0 ? 'accent' : 'default'}>
                                        {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                                    </Chip>
                                </div>
                                <p className="text-xs leading-5 text-default-500">
                                    System alerts, sync updates, and workflow confirmations land here.
                                </p>
                            </div>

                            <div className="flex items-center gap-1">
                                {process.env.NODE_ENV === 'development' && (
                                    <Button size="sm" variant="ghost" isIconOnly onPress={handleTest} isPending={isLoading} aria-label="Send test notification">
                                        <Plus className="size-4" />
                                    </Button>
                                )}
                                <EnablePushButton />
                            </div>
                        </div>

                        {(notifications.length > 0 || unreadCount > 0) && (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                {unreadCount > 0 && (
                                    <Button size="sm" variant="ghost" onPress={handleReadAll} className="h-8 gap-2 rounded-full px-3 text-xs font-medium">
                                        <CheckCheck className="size-3.5" />
                                        Mark all read
                                    </Button>
                                )}
                                {notifications.length > 0 && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onPress={handleClearAll}
                                        className="h-8 gap-2 rounded-full px-3 text-xs font-medium text-default-500 hover:text-danger"
                                    >
                                        <Trash2 className="size-3.5" />
                                        Clear list
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto overscroll-contain bg-default-50/30">
                        {notifications.length === 0 ? (
                            <div className="flex flex-col items-center px-6 py-12 text-center">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-default-100 text-default-400">
                                    <Bell className="size-6" />
                                </div>
                                <p className="mt-4 text-base font-semibold text-foreground">No notifications yet</p>
                                <p className="mt-2 max-w-xs text-sm leading-6 text-default-500">
                                    When uploads finish, syncs fail, or admin notices go live, they will appear here.
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col p-2">
                                {notifications.map((notification) => (
                                    <NotificationItem
                                        key={notification.id}
                                        notification={notification}
                                        onRead={handleRead}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
    );
}

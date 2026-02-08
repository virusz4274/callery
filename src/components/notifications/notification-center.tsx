"use client";

import { useState, useEffect, useRef } from 'react';
import { Popover, Button } from '@heroui/react';
import { Bell, CheckCheck, Plus, Trash2 } from 'lucide-react';
import { NotificationResponse } from '@/lib/db/types';
import { fetchNotifications, readNotification, readAllNotifications, sendTestNotification, clearAllNotifications } from '@/app/actions/notifications';
import { NotificationItem } from './notification-item';
import { useToast } from '@/components/toast-provider';
import { EnablePushButton } from './push-notification-toggle';

export function NotificationCenter() {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const lastUnreadCount = useRef(0);
    const { toast } = useToast();

    // Initial load
    useEffect(() => {
        loadNotifications(true);
        // Poll every 60 seconds
        const interval = setInterval(() => loadNotifications(false), 60000);
        return () => clearInterval(interval);
    }, []);

    const loadNotifications = async (isInitial: boolean = false) => {
        try {
            const data = await fetchNotifications();
            setNotifications(data);

            const newUnreadCount = data.filter(n => !n.isRead).length;

            // Show toast if new notifications arrived (not on initial load)
            if (!isInitial && newUnreadCount > lastUnreadCount.current) {
                const diff = newUnreadCount - lastUnreadCount.current;
                // Find the newest 'diff' unread notifications
                const newItems = data.filter(n => !n.isRead).slice(0, diff);

                newItems.forEach(item => {
                    const statusMap: Record<string, "default" | "success" | "warning" | "danger"> = {
                        'info': 'default',
                        'success': 'success',
                        'warning': 'warning',
                        'error': 'danger'
                    };

                    toast({
                        title: item.title,
                        description: item.message,
                        status: statusMap[item.type] || 'default'
                    });
                });
            }

            setUnreadCount(newUnreadCount);
            lastUnreadCount.current = newUnreadCount;
        } catch (error) {
            console.error('Failed to load notifications', error);
        }
    };

    const handleRead = async (id: string) => {
        // Optimistic update
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
        await readNotification(id);
    };

    const handleReadAll = async () => {
        // Optimistic update
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        setUnreadCount(0);
        try {
            await readAllNotifications();
            // Re-fetch to confirm state using the server source of truth
            await loadNotifications();
        } catch (e) {
            console.error('Mark all as read Failed', e);
            // Revert state if failed (optional, but good practice)
            await loadNotifications();
        }
    };

    const handleClearAll = async () => {
        // Optimistic update
        setNotifications([]);
        setUnreadCount(0);
        try {
            await clearAllNotifications();
            await loadNotifications();
        } catch (e) {
            console.error('Clear all Failed', e);
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
                <Button
                    variant="ghost"
                    isIconOnly
                    className="relative"
                    aria-label="Notifications"
                >
                    <Bell className="size-5 text-default-500" />
                    {unreadCount > 0 && (
                        <span className="absolute top-2 right-2 size-2 bg-red-500 rounded-full ring-2 ring-background transform translate-x-1/2 -translate-y-1/2" />
                    )}
                </Button>
            </Popover.Trigger>
            <Popover.Content className="w-80 p-0 overflow-hidden" placement="bottom end">
                <Popover.Dialog className="flex flex-col max-h-[500px]">
                    <div className="flex items-center justify-between p-3 border-b border-default-200 bg-background/50 backdrop-blur-md sticky top-0 z-10">
                        <Popover.Heading className="text-sm font-semibold">Notifications</Popover.Heading>
                        <div className="flex gap-1">
                            {process.env.NODE_ENV === 'development' && (
                                <Button size="sm" variant="ghost" isIconOnly onPress={handleTest} isPending={isLoading}>
                                    <Plus className="size-4" />
                                </Button>
                            )}
                            <EnablePushButton />
                            {notifications.length > 0 && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    isIconOnly
                                    onPress={handleClearAll}
                                    className="text-default-500 hover:text-danger"
                                    aria-label="Clear all notifications"
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            )}
                            {unreadCount > 0 && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onPress={handleReadAll}
                                    className="text-xs h-7 px-2"
                                >
                                    <CheckCheck className="size-3 mr-1" /> Mark all read
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="overflow-y-auto flex-1 overscroll-contain">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                                <Bell className="size-8 mb-2 opacity-20" />
                                <p className="text-sm">No notifications yet</p>
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {notifications.map(notification => (
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

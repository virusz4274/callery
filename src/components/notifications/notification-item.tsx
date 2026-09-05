"use client";

import Link from 'next/link';
import { CheckCircle, ExternalLink, Info, AlertTriangle, XCircle } from 'lucide-react';
import { NotificationResponse } from '@/lib/db/types';
import { cn } from '@/lib/utils';

interface NotificationItemProps {
    notification: NotificationResponse;
    onRead: (id: string) => void;
}

const iconMap = {
    info: {
        icon: Info,
        tone: 'bg-primary/10 text-primary',
        unreadTone: 'border-primary/20 bg-primary/5',
    },
    success: {
        icon: CheckCircle,
        tone: 'bg-success/10 text-success',
        unreadTone: 'border-success/20 bg-success/5',
    },
    warning: {
        icon: AlertTriangle,
        tone: 'bg-warning/10 text-warning',
        unreadTone: 'border-warning/20 bg-warning/5',
    },
    error: {
        icon: XCircle,
        tone: 'bg-danger/10 text-danger',
        unreadTone: 'border-danger/20 bg-danger/5',
    },
} as const;

export function NotificationItem({ notification, onRead }: NotificationItemProps) {
    const meta = iconMap[notification.type] || iconMap.info;
    const Icon = meta.icon;

    return (
        <button
            type="button"
            className={cn(
                'group w-full rounded-xl border border-transparent p-3 text-left transition-all hover:border-default-200/80 hover:bg-background',
                notification.isRead ? 'bg-background/50' : meta.unreadTone
            )}
            onClick={() => !notification.isRead && onRead(notification.id)}
        >
            <div className="flex items-start gap-3">
                <div className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl', meta.tone)}>
                    <Icon className="size-4.5" />
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className={cn('truncate text-sm font-semibold', notification.isRead ? 'text-default-600' : 'text-foreground')}>
                                {notification.title}
                            </p>
                            <p className="text-[11px] uppercase tracking-[0.16em] text-default-400">
                                {new Date(notification.createdAt).toLocaleString()}
                            </p>
                        </div>
                        {!notification.isRead && <div className="mt-1 size-2 rounded-full bg-primary" />}
                    </div>

                    <p className="line-clamp-3 text-sm leading-6 text-default-500">
                        {notification.message}
                    </p>

                    {notification.link && (
                        <div>
                            <Link
                                href={notification.link}
                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                onClick={(event) => event.stopPropagation()}
                            >
                                Open linked page
                                <ExternalLink className="size-3" />
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </button>
    );
}

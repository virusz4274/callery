"use client";

import { NotificationResponse } from '@/lib/db/types';
import { cn } from '@/lib/utils';
import { Info, CheckCircle, AlertTriangle, XCircle, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface NotificationItemProps {
    notification: NotificationResponse;
    onRead: (id: string) => void;
}

export function NotificationItem({ notification, onRead }: NotificationItemProps) {
    const icons = {
        info: <Info className="size-5 text-blue-500" />,
        success: <CheckCircle className="size-5 text-green-500" />,
        warning: <AlertTriangle className="size-5 text-yellow-500" />,
        error: <XCircle className="size-5 text-red-500" />,
    };

    return (
        <div 
            className={cn(
                "flex items-start gap-3 p-3 border-b border-default-200/50 last:border-0 hover:bg-default-50 transition-colors cursor-pointer",
                !notification.isRead && "bg-blue-50/50 dark:bg-blue-900/10"
            )}
            onClick={() => !notification.isRead && onRead(notification.id)}
        >
            <div className="mt-0.5 shrink-0">
                {icons[notification.type]}
            </div>
            <div className="flex-1 space-y-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <p className={cn("text-sm font-medium truncate", !notification.isRead ? "text-foreground" : "text-muted-foreground")}>
                        {notification.title}
                    </p>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                        {new Date(notification.createdAt).toLocaleDateString()}
                    </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 break-words">
                    {notification.message}
                </p>
                {notification.link && (
                    <Link href={notification.link} className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1" onClick={(e) => e.stopPropagation()}>
                        View <ExternalLink className="size-3" />
                    </Link>
                )}
            </div>
            {!notification.isRead && (
                <div className="shrink-0 self-center pl-1">
                    <div className="size-2 rounded-full bg-blue-500" />
                </div>
            )}
        </div>
    );
}

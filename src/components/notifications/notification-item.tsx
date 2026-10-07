"use client";

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { Check, CheckCircle, ArrowUpRight, Info, AlertTriangle, XCircle } from 'lucide-react';
import type { NotificationResponse } from '@/lib/db/types';
import { getNotificationActionLabel, getNotificationTimestamp } from '@/lib/notification-presentation';
import { cn } from '@/lib/utils';

interface NotificationItemProps {
    notification: NotificationResponse;
    onRead: (id: string) => void;
    onNavigate: () => void;
    isDisabled: boolean;
    isPending: boolean;
}

const iconMap = {
    info: { icon: Info, tone: 'text-accent' },
    success: { icon: CheckCircle, tone: 'text-success' },
    warning: { icon: AlertTriangle, tone: 'text-warning' },
    error: { icon: XCircle, tone: 'text-danger' },
} as const;

export function NotificationItem({ notification, onRead, onNavigate, isDisabled, isPending }: NotificationItemProps) {
    const [expanded, setExpanded] = useState(false);
    const [overflows, setOverflows] = useState(false);
    const titleProbe = useRef<HTMLParagraphElement>(null);
    const messageProbe = useRef<HTMLParagraphElement>(null);
    const contentId = useId();
    const meta = iconMap[notification.type] || iconMap.info;
    const Icon = meta.icon;
    const time = getNotificationTimestamp(notification.createdAt);

    useEffect(() => {
        let active = true;
        const measure = () => {
            if (active) setOverflows([titleProbe.current, messageProbe.current].some((element) => element && element.scrollHeight > element.clientHeight + 1));
        };
        measure();
        void document.fonts.ready.then(measure);
        const observer = new ResizeObserver(measure);
        [titleProbe.current, messageProbe.current].forEach((element) => { if (element) observer.observe(element); });
        return () => { active = false; observer.disconnect(); };
    }, [notification.title, notification.message]);

    const titleClass = 'whitespace-pre-wrap text-sm font-semibold [overflow-wrap:anywhere]';
    const messageClass = 'whitespace-pre-wrap text-sm leading-6 text-muted [overflow-wrap:anywhere]';

    return (
        <li className={cn('rounded-xl border p-3', notification.isRead ? 'border-border bg-surface' : 'border-accent/20 bg-accent/5')}>
            <div className="flex items-start gap-2">
                <Icon className={cn('mt-1 size-5 shrink-0', meta.tone)} aria-label={notification.type} />
                <div className="min-w-0 flex-1">
                    <div id={contentId}>
                        <div className="relative">
                            <p ref={titleProbe} aria-hidden="true" className={cn(titleClass, 'invisible absolute inset-x-0 top-0 line-clamp-2 pointer-events-none')}>{notification.title}</p>
                            <p className={cn(titleClass, !expanded && 'line-clamp-2')}>{notification.title}</p>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                            <time dateTime={Number.isNaN(Date.parse(notification.createdAt)) ? undefined : notification.createdAt} aria-label={time.absolute} title={time.absolute}>{time.relative}</time>
                            {!notification.isRead && <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />Unread</span>}
                        </div>
                        {notification.message && <div className="relative mt-2">
                            <p ref={messageProbe} aria-hidden="true" className={cn(messageClass, 'invisible absolute inset-x-0 top-0 line-clamp-2 pointer-events-none')}>{notification.message}</p>
                            <p className={cn(messageClass, !expanded && 'line-clamp-2')}>{notification.message}</p>
                        </div>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2">
                        {overflows && <Button size="sm" variant="ghost" className="min-h-11 px-2" aria-expanded={expanded} aria-controls={contentId} onPress={() => setExpanded((value) => !value)}>{expanded ? 'Show less' : 'Show more'}</Button>}
                        {notification.link && <Link href={notification.link} aria-disabled={isDisabled || undefined} onClick={(event) => { if (isDisabled) { event.preventDefault(); return; } if (!notification.isRead) onRead(notification.id); onNavigate(); }}
                            className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-accent hover:underline">
                            {getNotificationActionLabel(notification.link)}<ArrowUpRight className="size-4" aria-hidden="true" />
                        </Link>}
                        {(!notification.isRead || isPending) && <Button size="sm" variant="ghost" isIconOnly className="ml-auto size-11 shrink-0" aria-label={`Mark as read: ${notification.title}`}
                            isDisabled={isDisabled} isPending={isPending} onPress={() => onRead(notification.id)}><Check className="size-4" aria-hidden="true" /></Button>}
                    </div>
                </div>
            </div>
        </li>
    );
}

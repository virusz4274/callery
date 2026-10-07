'use client';

import React from 'react';
import { Card, Surface } from '@heroui/react';
import type { LucideIcon } from 'lucide-react';
import {
    Activity,
    BadgeDollarSign,
    BellRing,
    CalendarDays,
    Cog,
    CreditCard,
    FileAudio,
    HardDrive,
    Megaphone,
    Phone,
    ScrollText,
    Search,
    ShieldAlert,
    ShieldCheck,
    UserPlus,
    Users,
} from 'lucide-react';

const ADMIN_STAT_ICONS = {
    Users,
    Search,
    ShieldCheck,
    CreditCard,
    BadgeDollarSign,
    ScrollText,
    Activity,
    CalendarDays,
    Megaphone,
    BellRing,
    ShieldAlert,
    UserPlus,
    Cog,
    Phone,
    HardDrive,
    FileAudio,
} as const;

export type AdminStatIconName = keyof typeof ADMIN_STAT_ICONS;

type AdminStat = {
    label: string;
    value: string | number;
    helper: string;
    icon?: LucideIcon;
    iconName?: AdminStatIconName;
};

type AdminPageShellProps = {
    eyebrow: string;
    title: string;
    description?: string;
    actions?: React.ReactNode;
    stats?: AdminStat[];
    children: React.ReactNode;
};

export function AdminPageShell({ title, description, actions, stats, children }: AdminPageShellProps) {
    return (
        <div className="space-y-6">

            <Card className="gap-0 overflow-hidden p-0">
                <div className="flex flex-wrap items-start justify-between gap-3 p-4 md:p-5">
                    <div className="min-w-0 space-y-2">
                        <div className="space-y-3">
                            <h1 className="break-words text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                                {title}
                            </h1>
                            {description && <p className="max-w-2xl text-sm leading-6 text-muted">{description}</p>}
                        </div>
                    </div>

                    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
                </div>

                {stats && stats.length > 0 && (
                    <div style={{ "--admin-stat-count": stats.length } as React.CSSProperties} className="grid grid-cols-1 gap-3 border-t border-border p-4 min-[360px]:grid-cols-2 xl:grid-cols-[repeat(var(--admin-stat-count),minmax(0,1fr))] md:p-5">
                        {stats.map((stat) => {
                            const Icon = stat.iconName ? ADMIN_STAT_ICONS[stat.iconName] : stat.icon;

                            return (
                                <Surface
                                    key={stat.label}
                                    variant="secondary"
                                    className="p-3"
                                >
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 text-sm font-medium text-muted">
                                            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                                            {stat.label}
                                        </div>
                                        <div className="break-words text-2xl font-semibold text-foreground">{stat.value}</div>
                                        <div className="hidden text-xs leading-5 text-muted md:block">{stat.helper}</div>
                                    </div>
                                </Surface>
                            );
                        })}
                    </div>
                )}
            </Card>

            {children}
        </div>
    );
}

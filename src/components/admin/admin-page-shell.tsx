'use client';

import React from 'react';
import { Chip, Surface } from '@heroui/react';
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
    description: string;
    actions?: React.ReactNode;
    stats?: AdminStat[];
    children: React.ReactNode;
};

export function AdminPageShell({ eyebrow, title, description, actions, stats, children }: AdminPageShellProps) {
    return (
        <div className="relative space-y-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(circle_at_top_left,rgba(38,132,255,0.14),transparent_34%),radial-gradient(circle_at_top_right,rgba(13,148,136,0.12),transparent_28%)]" />

            <section className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/90 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
                <div className="grid gap-8 px-5 py-6 md:px-8 md:py-8 xl:grid-cols-[minmax(0,1.05fr)_auto] xl:items-start">
                    <div className="space-y-4">
                        <Chip variant="soft" color="accent" className="rounded-full px-3 py-1 text-xs font-medium">
                            {eyebrow}
                        </Chip>
                        <div className="space-y-3">
                            <h1 className="text-4xl font-black tracking-[-0.05em] text-foreground md:text-5xl">
                                {title}
                            </h1>
                            <p className="max-w-2xl text-base leading-7 text-default-600 md:text-lg">
                                {description}
                            </p>
                        </div>
                    </div>

                    {actions && <div className="flex flex-col gap-3 sm:flex-row xl:flex-col">{actions}</div>}
                </div>

                {stats && stats.length > 0 && (
                    <div className="grid gap-3 border-t border-default-100/80 bg-default-50/50 px-5 py-5 md:grid-cols-2 xl:grid-cols-4 md:px-8">
                        {stats.map((stat) => {
                            const Icon = stat.iconName ? ADMIN_STAT_ICONS[stat.iconName] : stat.icon;

                            return (
                                <Surface
                                    key={stat.label}
                                    variant="secondary"
                                    className="rounded-[1.5rem] border border-default-200/80 p-4"
                                >
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                                            {stat.label}
                                        </div>
                                        <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                                        <div className="text-sm text-default-500">{stat.helper}</div>
                                    </div>
                                </Surface>
                            );
                        })}
                    </div>
                )}
            </section>

            {children}
        </div>
    );
}

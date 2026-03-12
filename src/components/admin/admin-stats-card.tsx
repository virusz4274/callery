'use client';

import { Card, Chip } from '@heroui/react';

interface AdminStatsCardProps {
    title: string;
    value: string | number;
    description?: string;
    icon?: React.ReactNode;
}

export function AdminStatsCard({ title, value, description, icon }: AdminStatsCardProps) {
    return (
        <Card className="rounded-[1.5rem] border border-default-200/80 bg-background/95 p-4 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.45)]">
            <div className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                    {title}
                </div>
                {icon && (
                    <div className="rounded-2xl bg-default-100 p-2 text-default-500">
                        {icon}
                    </div>
                )}
            </div>
            <div className="flex flex-col gap-1">
                <div className="text-3xl font-bold tracking-[-0.03em] text-foreground">{value}</div>
                {description && (
                    <Chip size="sm" variant="soft" color="default" className="mt-1 w-fit rounded-full">
                        {description}
                    </Chip>
                )}
            </div>
        </Card>
    );
}

'use client';

import { Card } from '@heroui/react';

interface AdminStatsCardProps {
    title: string;
    value: string | number;
    description?: string;
    icon?: React.ReactNode;
}

export function AdminStatsCard({ title, value, description, icon }: AdminStatsCardProps) {
    return (
        <Card className="p-4">
            <div className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div className="text-xs font-semibold uppercase text-muted">
                    {title}
                </div>
                {icon && (
                    <div className="rounded-2xl bg-surface-secondary p-2 text-muted">
                        {icon}
                    </div>
                )}
            </div>
            <div className="flex flex-col gap-1">
                <div className="text-3xl font-bold text-foreground">{value}</div>
                {description && (
                    <p className="mt-1 text-sm text-muted">
                        {description}
                    </p>
                )}
            </div>
        </Card>
    );
}

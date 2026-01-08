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
        <Card className="p-4 border border-default-200">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="text-sm font-medium text-default-600">
                    {title}
                </div>
                {icon && (
                    <div className="text-default-500">
                        {icon}
                    </div>
                )}
            </div>
            <div className="flex flex-col gap-1">
                <div className="text-2xl font-bold">{value}</div>
                {description && (
                    <p className="text-xs text-default-500">
                        {description}
                    </p>
                )}
            </div>
        </Card>
    );
}

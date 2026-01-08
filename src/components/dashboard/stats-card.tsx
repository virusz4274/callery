
import React from 'react';
import { Card } from '@heroui/react';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
    title: string;
    value: string | number;
    trend?: string; // e.g. "+2.5%" or "-5%"
    trendLabel?: string; // e.g. "Stable"
    trendType?: 'success' | 'warning' | 'danger' | 'default';
    icon: LucideIcon;
    iconClassName?: string; // e.g. "text-primary"
    iconBgClassName?: string; // e.g. "bg-primary/20"
    progressValue?: number; // 0-100
    progressColorClass?: string; // e.g. "from-primary to-primary/60"
    progressShadowClass?: string; // e.g. "shadow-[0_0_10px_rgba(var(--primary),0.5)]"
}

export function StatsCard({
    title,
    value,
    trend,
    trendLabel,
    trendType = 'default',
    icon: Icon,
    iconClassName,
    iconBgClassName,
    progressValue = 0,
    progressColorClass,
    progressShadowClass
}: StatsCardProps) {

    const getTrendColor = (type: string) => {
        switch (type) {
            case 'success': return 'text-success bg-success/10';
            case 'warning': return 'text-warning bg-warning/10';
            case 'danger': return 'text-danger bg-danger/10';
            default: return 'text-default-400 bg-default-200/50';
        }
    };

    return (
        <Card className="border-none bg-gradient-to-br from-content1/50 to-content2/50 backdrop-blur-xl shadow-medium hover:shadow-lg transition-all duration-300">
            <Card.Content className="p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-default-500 uppercase tracking-wider">{title}</p>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-4xl font-bold text-foreground">{value}</span>
                            {(trend || trendLabel) && (
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getTrendColor(trendType)}`}>
                                    {trend || trendLabel}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm ${iconBgClassName} ${iconClassName}`}>
                        <Icon className="h-6 w-6" />
                    </div>
                </div>
                <div className="mt-6 h-2 w-full rounded-full bg-default-100/50 overflow-hidden">
                    <div
                        className={`h-full rounded-full bg-gradient-to-r ${progressColorClass} ${progressShadowClass}`}
                        style={{ width: `${Math.min(100, Math.max(0, progressValue))}%` }}
                    />
                </div>
            </Card.Content>
        </Card>
    );
}

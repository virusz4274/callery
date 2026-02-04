
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
            <Card.Content className="p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-[10px] sm:text-xs font-medium text-default-500 uppercase tracking-wider truncate">{title}</p>
                        <div className="mt-1 flex items-baseline gap-1 sm:gap-2 flex-wrap">
                            <span className="text-xl sm:text-2xl font-bold text-foreground truncate">{value}</span>
                            {(trend || trendLabel) && (
                                <span className={`text-[8px] sm:text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${getTrendColor(trendType)} whitespace-nowrap`}>
                                    {trend || trendLabel}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className={`flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl shadow-sm ${iconBgClassName}`}>
                        <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${iconClassName}`} />
                    </div>
                </div>
                <div className="mt-3 h-1 sm:h-1.5 w-full rounded-full bg-default-100/50 overflow-hidden">
                    <div
                        className={`h-full rounded-full bg-gradient-to-r ${progressColorClass} ${progressShadowClass}`}
                        style={{ width: `${Math.min(100, Math.max(0, progressValue))}%` }}
                    />
                </div>
            </Card.Content>
        </Card>
    );
}

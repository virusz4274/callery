'use client';

import React, { useMemo } from 'react';
import { Phone, Clock, Users, BarChart } from 'lucide-react';
import { StatsCard } from '@/components/settings/stats-card';

interface DashboardStats {
    totalRecordings: number;
    newThisMonth: number;
    unknownCallers: number;
    avgDuration: number;
}

interface StatsGridProps {
    stats: DashboardStats | null;
}

export function StatsGrid({ stats }: StatsGridProps) {
    const summaryStats = useMemo(() => {
        return stats || { totalRecordings: 0, newThisMonth: 0, unknownCallers: 0, avgDuration: 0 };
    }, [stats]);

    const avgDuration = `${Math.floor(summaryStats.avgDuration / 60)}m ${String(summaryStats.avgDuration % 60).padStart(2, '0')}s`;

    return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatsCard
                title="Total recordings"
                value={summaryStats.totalRecordings}
                subtitle="Calls currently indexed in your workspace"
                statusLabel={
                    summaryStats.newThisMonth > 0
                        ? `${summaryStats.newThisMonth} added this month`
                        : 'No new uploads this month'
                }
                icon={Phone}
                tone="accent"
            />

            <StatsCard
                title="New this month"
                value={`+${summaryStats.newThisMonth}`}
                subtitle="Fresh recordings added during the current month"
                statusLabel={summaryStats.newThisMonth > 0 ? 'Library is active' : 'Waiting for new intake'}
                icon={Clock}
                tone="success"
            />

            <StatsCard
                title="Unknown callers"
                value={summaryStats.unknownCallers}
                subtitle="Contacts that still need cleanup or identification"
                statusLabel={
                    summaryStats.unknownCallers > 0
                        ? 'Review recommended'
                        : 'Directory is fully identified'
                }
                icon={Users}
                tone="warning"
            />

            <StatsCard
                title="Average duration"
                value={avgDuration}
                subtitle="Typical length across recorded conversations"
                statusLabel="Useful for spotting outliers"
                icon={BarChart}
                tone="default"
            />
        </div>
    );
}

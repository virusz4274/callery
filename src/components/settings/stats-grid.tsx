'use client';

import { useMemo } from 'react';
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
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatsCard title="Total recordings" value={summaryStats.totalRecordings} icon={Phone} tone="accent" />
            <StatsCard title="New this month" value={summaryStats.newThisMonth} icon={Clock} tone="success" />
            <StatsCard title="Unknown callers" value={summaryStats.unknownCallers} icon={Users} tone="warning" />
            <StatsCard title="Average duration" value={avgDuration} icon={BarChart} />
        </div>
    );
}


"use client"

import React, { useMemo } from 'react';
import { Phone, Clock, Users, BarChart } from 'lucide-react';
import { StatsCard } from './stats-card';

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

    return (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <StatsCard
                title="Total Recordings"
                value={summaryStats.totalRecordings}
                icon={Phone}
                iconClassName="text-accent"
                iconBgClassName="bg-accent/20"
                progressValue={70}
                progressColorClass="from-accent to-accent/60"
                progressShadowClass="shadow-[0_0_10px_rgba(var(--accent),0.5)]"
            />

            <StatsCard
                title="New This Month"
                value={`+${summaryStats.newThisMonth}`}
                icon={Clock}
                iconClassName="text-secondary"
                iconBgClassName="bg-secondary/20"
                progressValue={45}
                progressColorClass="from-secondary to-secondary/60"
                progressShadowClass="shadow-[0_0_10px_rgba(var(--secondary),0.5)]"
            />

            <StatsCard
                title="Unknown Callers"
                value={summaryStats.unknownCallers}
                icon={Users}
                iconClassName="text-warning"
                iconBgClassName="bg-warning/20"
                progressValue={30}
                progressColorClass="from-warning to-warning/60"
                progressShadowClass="shadow-[0_0_10px_rgba(var(--warning),0.5)]"
            />

            <StatsCard
                title="Avg. Duration"
                value={`${Math.floor(summaryStats.avgDuration / 60)}m ${summaryStats.avgDuration % 60}s`}
                icon={BarChart}
                iconClassName="text-success"
                iconBgClassName="bg-success/20"
                progressValue={85}
                progressColorClass="from-success to-success/60"
                progressShadowClass="shadow-[0_0_10px_rgba(var(--success),0.5)]"
            />
        </div>
    );
}

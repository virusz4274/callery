'use client';

import React from 'react';
import { StatsGrid } from '@/components/settings/stats-grid';
import { useStats } from '@/hooks/use-stats';
import { Skeleton } from '@heroui/react';

export function OverviewSettings() {
    const { stats, isLoading, error } = useStats();

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Overview</h2>
                    <p className="text-default-500">Your account activity and usage statistics.</p>
                </div>
                <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-32 rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 border border-danger/20 bg-danger/10 rounded-xl text-danger">
                Failed to load stats: {error.message}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Overview</h2>
                <p className="text-default-500">Your account activity and usage statistics.</p>
            </div>

            <StatsGrid stats={stats} />

            <div className="p-4 rounded-xl border border-default-200 bg-default-50">
                <h3 className="font-semibold mb-2">Account Status</h3>
                <div className="text-sm text-default-600">
                    <p>Your account is active and verified.</p>
                </div>
            </div>
        </div>
    );
}

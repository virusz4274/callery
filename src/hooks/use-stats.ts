'use client';

import { useState, useEffect } from 'react';
import type { DashboardStats } from '@/lib/db/recordings';
import { getStatsAction } from '@/app/actions/stats';

export function useStats() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const fetchStats = async () => {
            setIsLoading(true);
            try {
                const response = await getStatsAction();
                if (response.error) {
                    throw new Error(response.error);
                }
                setStats(response.stats as DashboardStats);
            } catch (err) {
                setError(err instanceof Error ? err : new Error('Unknown error'));
            } finally {
                setIsLoading(false);
            }
        };
        fetchStats();
    }, []);

    return { stats, isLoading, error };
}

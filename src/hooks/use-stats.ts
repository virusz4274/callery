'use client';

import useSWR from 'swr';
import type { DashboardStats } from '@/lib/db/recordings';
import { getStatsAction } from '@/app/actions/stats';
import { useUser } from '@/lib/auth/client';

export function useStats() {
    const { user } = useUser();
    const { data, isLoading, error } = useSWR(user ? ['stats', user.id] : null, async () => {
        const response = await getStatsAction();
        if (response.error) throw new Error(response.error);
        return response.stats as DashboardStats;
    });
    return { stats: user ? data ?? null : null, isLoading, error: error ?? null };
}

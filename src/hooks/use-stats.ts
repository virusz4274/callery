'use client';

import { useState, useEffect } from 'react';
import { authFetch } from '@/lib/api-client';
import type { DashboardStats } from '@/lib/db/recordings';

export function useStats() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const fetchStats = async () => {
            setIsLoading(true);
            try {
                const response = await authFetch('/api/stats');
                if (response.ok) {
                    const data = await response.json();
                    setStats(data);
                }
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

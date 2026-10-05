'use server';

import { logger } from '@/lib/logger';

import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { getDashboardStats } from '@/lib/db/recordings';

export async function getStatsAction() {
    const authSubject = await getAuthSubjectFromSession();
    if (!authSubject) {
        return { error: 'Unauthorized' };
    }

    try {
        const stats = await getDashboardStats(authSubject);
        return { stats };
    } catch (error) {
        logger.error('Error fetching stats:', error);
        return { error: 'Failed to fetch statistics' };
    }
}

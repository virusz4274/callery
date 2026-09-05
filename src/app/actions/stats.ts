import { logger } from '@/lib/logger';
'use server';

import { getFirebaseUidFromSession } from '@/lib/auth-utils';
import { getDashboardStats } from '@/lib/db/recordings';

export async function getStatsAction() {
    const firebaseUid = await getFirebaseUidFromSession();
    if (!firebaseUid) {
        return { error: 'Unauthorized' };
    }

    try {
        const stats = await getDashboardStats(firebaseUid);
        return { stats };
    } catch (error) {
        logger.error('Error fetching stats:', error);
        return { error: 'Failed to fetch statistics' };
    }
}

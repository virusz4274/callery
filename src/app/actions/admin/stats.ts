'use server';

import { getMongoDb, Collections } from '@/lib/mongodb';
import { User } from '@/lib/db/types';

/**
 * Get system-wide statistics for the admin dashboard.
 */
export async function getSystemStats() {
    const db = await getMongoDb();

    const totalUsers = await db.collection(Collections.USERS).countDocuments();
    const totalRecordings = await db.collection(Collections.RECORDINGS).countDocuments();

    // Aggregate total usage
    const usageStats = await db.collection<User>(Collections.USERS).aggregate([
        {
            $group: {
                _id: null,
                totalStorageUsed: { $sum: '$storageUsed' },
                totalTranscriptionUsed: { $sum: '$transcriptionUsed' }
            }
        }
    ]).toArray();

    const { totalStorageUsed, totalTranscriptionUsed } = usageStats[0] || { totalStorageUsed: 0, totalTranscriptionUsed: 0 };

    return {
        totalUsers,
        totalRecordings,
        totalStorageUsed,
        totalTranscriptionUsed
    };
}

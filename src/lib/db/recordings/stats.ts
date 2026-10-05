import { Collections, getMongoDb } from '@/lib/mongodb';
import { findUserByAuthSubject } from '../users';
import type { Recording } from '../types';
import type { DashboardStats } from './types';

export async function getDashboardStats(authSubject: string): Promise<DashboardStats> {
    const db = await getMongoDb();
    const now = new Date();
    const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

    const user = await findUserByAuthSubject(authSubject);
    const totalRecordings = user?.totalRecordings || 0;
    const totalDuration = user?.totalDuration || 0;

    const [monthCount, unknownCount] = await Promise.all([
        db.collection<Recording>(Collections.RECORDINGS).countDocuments({
            authSubject,
            isArchived: { $ne: true },
            recordedAt: { $gte: oneMonthAgo },
        }),
        db.collection<Recording>(Collections.RECORDINGS).countDocuments({
            authSubject,
            isArchived: { $ne: true },
            $or: [{ contactName: { $exists: false } }, { contactName: null }],
        }),
    ]);

    return {
        totalRecordings,
        newThisMonth: monthCount,
        unknownCallers: unknownCount,
        avgDuration: totalRecordings > 0 ? Math.round(totalDuration / totalRecordings) : 0,
    };
}

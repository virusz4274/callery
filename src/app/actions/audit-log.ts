import { getMongoDb, Collections } from '@/lib/mongodb';
import { AdminLog } from '@/lib/db/types';
import { ObjectId } from 'mongodb';

export type LogActionType =
    | 'USER_BAN'
    | 'USER_UNBAN'
    | 'USER_ROLE_UPDATE'
    | 'USER_LIMITS_UPDATE'
    | 'USER_DELETE'
    | 'PLAN_CREATE'
    | 'PLAN_UPDATE'
    | 'PLAN_DELETE'
    | 'SETTINGS_UPDATE'
    | 'ANNOUNCEMENT_CREATE'
    | 'ANNOUNCEMENT_UPDATE'
    | 'ANNOUNCEMENT_DELETE';

export async function logAdminAction(
    adminId: string,
    action: LogActionType,
    details: Record<string, unknown>,
    targetId?: string,
    targetType?: 'USER' | 'PLAN' | 'SYSTEM' | 'ANNOUNCEMENT'
) {
    try {
        const db = await getMongoDb();

        // Fetch admin email for easier reading logs later
        const adminUser = await db.collection(Collections.USERS).findOne({ _id: new ObjectId(adminId) });
        const adminEmail = adminUser?.email || 'unknown';

        const logEntry: AdminLog = {
            _id: new ObjectId(),
            adminId,
            adminEmail,
            action,
            details,
            targetId,
            targetType,
            createdAt: new Date()
        };

        await db.collection(Collections.ADMIN_LOGS).insertOne(logEntry);
    } catch (error) {
        // Logging should not break the main action, but we should know about it
        console.error('Failed to log admin action:', error);
    }
}

/**
 * Fetch paginated audit logs.
 */
import { AdminLogResponse } from '@/lib/db/types';

export async function getAuditLogs(
    page: number = 1,
    limit: number = 20,
    actionFilter?: string,
    adminIdFilter?: string
) {
    const db = await getMongoDb();
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};
    if (actionFilter) query.action = actionFilter;
    if (adminIdFilter) query.adminId = adminIdFilter;

    const totalLogs = await db.collection(Collections.ADMIN_LOGS).countDocuments(query);
    const logs = await db.collection<AdminLog>(Collections.ADMIN_LOGS)
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();

    const serializedLogs: AdminLogResponse[] = logs.map(log => ({
        id: log._id.toString(),
        adminId: log.adminId,
        adminEmail: log.adminEmail,
        action: log.action,
        targetId: log.targetId,
        targetType: log.targetType,
        details: log.details,
        createdAt: log.createdAt.toISOString(),
    }));

    return {
        logs: serializedLogs,
        total: totalLogs,
        page,
        limit,
        totalPages: Math.ceil(totalLogs / limit)
    };
}

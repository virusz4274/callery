import { AdminLog, AdminLogResponse } from '@/lib/db/types';
import { parseObjectId, requireCurrentAdmin } from '@/lib/admin-auth';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { logger } from '@/lib/logger';

export type LogActionType =
    | 'TEAM_INVITE'
    | 'TEAM_INVITE_REVOKE'
    | 'RECORDING_DELETE'
    | 'USER_BAN'
    | 'USER_UNBAN'
    | 'USER_ROLE_UPDATE'
    | 'USER_LIMITS_UPDATE'
    | 'USER_USAGE_UPDATE'
    | 'USER_SOFT_DELETE'
    | 'USER_RESTORE'
    | 'USER_HARD_DELETE'
    | 'PLAN_CREATE'
    | 'PLAN_UPDATE'
    | 'PLAN_DELETE'
    | 'SETTINGS_UPDATE'
    | 'INCIDENT_CLEAR'
    | 'INCIDENT_CLEAR_ALL'
    | 'ASYNC_JOB_RETRY'
    | 'ANNOUNCEMENT_CREATE'
    | 'ANNOUNCEMENT_UPDATE'
    | 'ANNOUNCEMENT_DELETE'
    | 'TEST_EMAIL_SEND';

export async function logAdminAction(
    adminId: string,
    action: LogActionType,
    details: Record<string, unknown>,
    targetId?: string,
    targetType?: 'USER' | 'PLAN' | 'SYSTEM' | 'ANNOUNCEMENT'
) {
    try {
        const db = await getMongoDb();

        const adminUser = await db.collection(Collections.USERS).findOne({ _id: parseObjectId(adminId, 'adminId') });
        const adminEmail = adminUser?.email || 'unknown';

        const logEntry: AdminLog = {
            _id: new ObjectId(),
            adminId,
            adminEmail,
            action,
            details,
            targetId,
            targetType,
            createdAt: new Date(),
        };

        await db.collection(Collections.ADMIN_LOGS).insertOne(logEntry);
    } catch (error) {
        logger.error('Failed to log admin action:', error);
    }
}

/**
 * Fetch paginated audit logs.
 */
export async function getAuditLogs(
    page: number = 1,
    limit: number = 20,
    actionFilter?: string,
    adminIdFilter?: string,
    startDate?: Date,
    endDate?: Date
) {
    await requireCurrentAdmin();

    const db = await getMongoDb();
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};
    if (actionFilter) {
        query.action = actionFilter;
    }
    if (adminIdFilter) {
        query.adminId = adminIdFilter;
    }

    if (startDate || endDate) {
        const createdAtFilter: Record<string, Date> = {};
        if (startDate) {
            createdAtFilter.$gte = startDate;
        }
        if (endDate) {
            createdAtFilter.$lte = endDate;
        }
        query.createdAt = createdAtFilter;
    }

    const totalLogs = await db.collection(Collections.ADMIN_LOGS).countDocuments(query);
    const logs = await db
        .collection<AdminLog>(Collections.ADMIN_LOGS)
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();

    const serializedLogs: AdminLogResponse[] = logs.map((log) => ({
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
        totalPages: Math.ceil(totalLogs / limit),
    };
}

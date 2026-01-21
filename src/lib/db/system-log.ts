import { getMongoDb, Collections } from '@/lib/mongodb';
import { AdminLog } from '@/lib/db/types';
import { ObjectId } from 'mongodb';

/**
 * Log a system-level event to the Admin Logs.
 * This does not require an authenticated admin user.
 */
export async function logSystemEvent(
    action: string,
    details: Record<string, unknown>,
    targetId?: string,
    targetType?: 'SYSTEM'
) {
    try {
        const db = await getMongoDb();

        const logEntry: AdminLog = {
            _id: new ObjectId(),
            adminId: 'SYSTEM',
            adminEmail: 'system@internal', // Placeholder for system actions
            action,
            details,
            targetId,
            targetType: targetType || 'SYSTEM',
            createdAt: new Date()
        };

        await db.collection(Collections.ADMIN_LOGS).insertOne(logEntry);
        console.log(`[SystemLog] Logged action: ${action} - ${JSON.stringify(details)}`);
    } catch (error) {
        console.error('Failed to log system event:', error);
    }
}

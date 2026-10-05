import type { Db } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { deleteUserData } from '@/lib/db/delete-user-data';
import type { User } from '../types';

import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export function getSoftDeleteRestoreWindowDays(): number {
    return env.SOFT_DELETE_RESTORE_DAYS;
}

export function buildRestoreDeadline(now: Date = new Date()): Date {
    const deadline = new Date(now);
    deadline.setDate(deadline.getDate() + getSoftDeleteRestoreWindowDays());
    return deadline;
}

export async function hardDeleteUserData(db: Db, user: User) {
    const result = await deleteUserData(user.authSubject, { db });
    return { deletedRecordings: result.recordingsDeleted, r2Errors: result.r2Failures.length, completed: !result.cleanupPending };
}

export async function purgeExpiredSoftDeletedUsers(limit: number = 50): Promise<{
    scanned: number;
    purged: number;
    r2Errors: number;
    userIds: string[];
}> {
    const db = await getMongoDb();
    const now = new Date();

    const usersToPurge = await db
        .collection<User>(Collections.USERS)
        .find({
            'softDelete.isDeleted': true,
            'softDelete.restoreUntil': { $lte: now },
        })
        .sort({ 'softDelete.restoreUntil': 1 })
        .limit(limit)
        .toArray();

    if (usersToPurge.length === 0) {
        return { scanned: 0, purged: 0, r2Errors: 0, userIds: [] };
    }

    let totalR2Errors = 0;
    const purgedUserIds: string[] = [];

    for (const user of usersToPurge) {
        try {
            const result = await hardDeleteUserData(db, user);
            totalR2Errors += result.r2Errors;
            if (result.completed) purgedUserIds.push(user._id.toString());
        } catch (error) {
            logger.error(`Account cleanup remains pending for ${user._id.toString()}:`, error);
        }
    }

    return {
        scanned: usersToPurge.length,
        purged: purgedUserIds.length,
        r2Errors: totalR2Errors,
        userIds: purgedUserIds,
    };
}

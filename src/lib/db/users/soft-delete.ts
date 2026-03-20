import type { Db } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { deleteFromR2 } from '@/lib/r2';
import { logger } from '@/lib/logger';
import type { Recording, User } from '../types';

import { env } from '@/lib/env';

export function getSoftDeleteRestoreWindowDays(): number {
    return env.SOFT_DELETE_RESTORE_DAYS;
}

export function buildRestoreDeadline(now: Date = new Date()): Date {
    const deadline = new Date(now);
    deadline.setDate(deadline.getDate() + getSoftDeleteRestoreWindowDays());
    return deadline;
}

export async function hardDeleteUserData(db: Db, user: User): Promise<{ deletedRecordings: number; r2Errors: number }> {
    const recordings = await db
        .collection<Recording>(Collections.RECORDINGS)
        .find({ firebaseUid: user.firebaseUid })
        .toArray();

    let r2Errors = 0;
    await Promise.all(
        recordings.map(async (recording) => {
            if (!recording.r2Key) {
                return;
            }

            try {
                await deleteFromR2(recording.r2Key);
            } catch (error) {
                r2Errors += 1;
                logger.error(`[hardDeleteUserData] Failed to delete R2 file for recording ${recording._id}:`, error);
            }
        })
    );

    const recordingIds = recordings.map((recording) => recording._id.toString());

    await db.collection(Collections.RECORDINGS).deleteMany({ firebaseUid: user.firebaseUid });
    await db.collection(Collections.CONTACTS).deleteMany({ firebaseUid: user.firebaseUid });
    await db.collection(Collections.EXPORT_JOBS).deleteMany({ firebaseUid: user.firebaseUid });
    await db.collection(Collections.NOTIFICATIONS).deleteMany({ userId: user._id });
    await db.collection(Collections.SUPPORT_MESSAGES).deleteMany({ firebaseUid: user.firebaseUid });

    if (recordingIds.length > 0) {
        await db.collection(Collections.TRANSCRIPTION_WEBHOOK_EVENTS).deleteMany({
            recordingId: { $in: recordingIds },
        });
    }

    await db.collection(Collections.USERS).deleteOne({ _id: user._id });

    return {
        deletedRecordings: recordings.length,
        r2Errors,
    };
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
        const result = await hardDeleteUserData(db, user);
        totalR2Errors += result.r2Errors;
        purgedUserIds.push(user._id.toString());
    }

    return {
        scanned: usersToPurge.length,
        purged: usersToPurge.length,
        r2Errors: totalR2Errors,
        userIds: purgedUserIds,
    };
}

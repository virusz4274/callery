import { NextRequest, NextResponse } from 'next/server';
import { getExpiredRecordings, deleteRecordings as deleteRecordingsFromDb } from '@/lib/db/recordings';
import { deleteFromR2 } from '@/lib/r2';
import { decrementStorageUsed } from '@/lib/db/users';
import { logger } from '@/lib/logger';

/**
 * Cron endpoint to enforce automatic deletion policies.
 * 
 * Protected by CRON_SECRET - must be called with:
 * `Authorization: Bearer ${CRON_SECRET}` header
 * 
 * Triggered by:
 * - Vercel Cron (via vercel.json)
 * - Docker cron job
 * - External scheduler (cron-job.org, AWS EventBridge, etc.)
 * - Manual: curl -X GET http://localhost:9000/api/cron/cleanup-recordings -H "Authorization: Bearer YOUR_SECRET"
 */
export async function GET(request: NextRequest) {
    // Verify authorization
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        logger.error('[cleanup-recordings] CRON_SECRET environment variable is not set');
        return NextResponse.json(
            { success: false, error: 'Server misconfiguration' },
            { status: 500 }
        );
    }

    // Accept both "Bearer TOKEN" and just "TOKEN"
    const providedToken = authHeader?.replace('Bearer ', '').trim();

    if (providedToken !== cronSecret) {
        logger.warn('[cleanup-recordings] Unauthorized cron request');
        return NextResponse.json(
            { success: false, error: 'Unauthorized' },
            { status: 401 }
        );
    }

    logger.info('[cleanup-recordings] Starting automatic deletion cleanup');

    try {
        // Get all expired recordings grouped by user
        const expiredByUser = await getExpiredRecordings(100);

        if (expiredByUser.length === 0) {
            logger.info('[cleanup-recordings] No expired recordings found');
            return NextResponse.json({
                success: true,
                message: 'No expired recordings found',
                deleted: 0,
                users: 0,
            });
        }

        let totalDeleted = 0;
        let totalR2Errors = 0;
        const userResults: { firebaseUid: string; deleted: number; errors: number }[] = [];

        // Process each user's expired recordings
        for (const { firebaseUid, recordings } of expiredByUser) {
            logger.info(`[cleanup-recordings] Processing ${recordings.length} expired recordings for user ${firebaseUid}`);

            const recordingIds = recordings.map(r => r._id.toString());

            // Delete from MongoDB
            const deletedRecordings = await deleteRecordingsFromDb(recordingIds, firebaseUid);

            if (deletedRecordings.length === 0) {
                continue;
            }

            // Delete from R2 in parallel
            let r2Errors = 0;
            let totalSizeDeleted = 0;

            const deletePromises = deletedRecordings.map(async (recording) => {
                try {
                    await deleteFromR2(recording.r2Key);
                    return { size: recording.fileSize, error: false };
                } catch (error) {
                    logger.error(`[cleanup-recordings] Failed to delete R2 key ${recording.r2Key}:`, error);
                    r2Errors++;
                    return { size: 0, error: true };
                }
            });

            const results = await Promise.all(deletePromises);
            totalSizeDeleted = results.reduce((acc, curr) => acc + curr.size, 0);

            // Update user's storage usage
            if (totalSizeDeleted > 0) {
                await decrementStorageUsed(firebaseUid, totalSizeDeleted);
            }

            totalDeleted += deletedRecordings.length;
            totalR2Errors += r2Errors;

            userResults.push({
                firebaseUid,
                deleted: deletedRecordings.length,
                errors: r2Errors,
            });
        }

        logger.info(`[cleanup-recordings] Completed. Deleted ${totalDeleted} recordings from ${userResults.length} users. R2 errors: ${totalR2Errors}`);

        return NextResponse.json({
            success: true,
            message: `Deleted ${totalDeleted} expired recording(s)`,
            deleted: totalDeleted,
            users: userResults.length,
            r2Errors: totalR2Errors,
            details: userResults,
        });

    } catch (error) {
        logger.error('[cleanup-recordings] Error during cleanup:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

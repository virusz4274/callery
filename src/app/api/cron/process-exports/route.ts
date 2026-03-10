import { NextRequest, NextResponse } from 'next/server';
import { claimNextExportJob, getExportJob } from '@/lib/db/export-jobs';
import { processExport } from '@/lib/export-processor';
import { logger } from '@/lib/logger';

export const maxDuration = 300;

/**
 * Cron endpoint to process queued export jobs.
 *
 * Protected by CRON_SECRET - must be called with:
 * `Authorization: Bearer ${CRON_SECRET}` header
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        logger.error('[process-exports] CRON_SECRET environment variable is not set');
        return NextResponse.json(
            { success: false, error: 'Server misconfiguration' },
            { status: 500 }
        );
    }

    const providedToken = authHeader?.replace('Bearer ', '').trim();
    if (providedToken !== cronSecret) {
        logger.warn('[process-exports] Unauthorized cron request');
        return NextResponse.json(
            { success: false, error: 'Unauthorized' },
            { status: 401 }
        );
    }

    const staleAfterMinutesRaw = process.env.EXPORT_JOB_STALE_MINUTES || '90';
    const staleAfterMinutes = Number.parseInt(staleAfterMinutesRaw, 10);
    const safeStaleAfterMinutes = Number.isNaN(staleAfterMinutes) ? 90 : Math.max(5, staleAfterMinutes);

    try {
        const job = await claimNextExportJob(safeStaleAfterMinutes);
        if (!job) {
            return NextResponse.json({
                success: true,
                message: 'No queued export jobs',
            });
        }

        logger.info(`[process-exports] Processing job ${job._id.toString()} for ${job.firebaseUid}`);
        await processExport(job._id.toString(), job.firebaseUid);
        const refreshed = await getExportJob(job._id.toString(), job.firebaseUid);

        return NextResponse.json({
            success: true,
            message: 'Processed export job',
            jobId: job._id.toString(),
            firebaseUid: job.firebaseUid,
            status: refreshed?.status || 'unknown',
        });
    } catch (error) {
        logger.error('[process-exports] Failed to process export queue:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

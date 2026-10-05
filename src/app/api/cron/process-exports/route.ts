import { NextRequest, NextResponse } from 'next/server';
import { claimNextExportJob, getExportJob } from '@/lib/db/export-jobs';
import { processExport } from '@/lib/export-processor';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';

export const maxDuration = 300;

/**
 * Cron endpoint to process queued export jobs.
 *
 * Protected by CRON_SECRET - must be called with:
 * `Authorization: Bearer ${CRON_SECRET}` header
 */
export async function GET(request: NextRequest) {
    if (!isAuthorizedCronRequest(request.headers.get('authorization'), env.CRON_SECRET)) {
        logger.warn('[process-exports] Unauthorized cron request');
        return NextResponse.json(
            { success: false, error: 'Unauthorized' },
            { status: 401 }
        );
    }

    const safeStaleAfterMinutes = env.EXPORT_JOB_STALE_MINUTES;

    try {
        const job = await claimNextExportJob(safeStaleAfterMinutes);
        if (!job) {
            return NextResponse.json({
                success: true,
                message: 'No queued export jobs',
            });
        }

        logger.info(`[process-exports] Processing job ${job._id.toString()} for ${job.authSubject}`);
        await processExport(job._id.toString(), job.authSubject);
        const refreshed = await getExportJob(job._id.toString(), job.authSubject);

        return NextResponse.json({
            success: true,
            message: 'Processed export job',
            jobId: job._id.toString(),
            authSubject: job.authSubject,
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

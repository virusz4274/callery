import { NextRequest, NextResponse } from 'next/server';
import { claimNextExportJob, getExportJob } from '@/lib/db/export-jobs';
import { processExport } from '@/lib/export-processor';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { cleanupExpiredExports } from '@/lib/export-processor/cleanup';
import { toExportFailure } from '@/lib/export-processor/errors';

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
        const cleanup = await cleanupExpiredExports();
        const job = await claimNextExportJob(safeStaleAfterMinutes);
        if (!job) {
            return NextResponse.json({
                success: true,
                message: 'No queued export jobs',
                cleanup,
            });
        }

        logger.info('[process-exports] Processing claimed archive');
        await processExport(job._id.toString(), job.authSubject, job.workerToken);
        const refreshed = await getExportJob(job._id.toString(), job.authSubject);

        return NextResponse.json({
            success: true,
            message: 'Processed export job',
            jobId: job._id.toString(),
            authSubject: job.authSubject,
            status: refreshed?.status || 'unknown',
            cleanup,
        });
    } catch (error) {
        logger.error('[process-exports] Failed to process export queue', toExportFailure(error));
        return NextResponse.json(
            {
                success: false,
                error: 'The export queue could not be processed.',
            },
            { status: 500 }
        );
    }
}

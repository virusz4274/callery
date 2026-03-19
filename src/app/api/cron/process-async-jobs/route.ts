import { NextRequest, NextResponse } from 'next/server';

import { processNextAsyncJob } from '@/lib/async-job-runner';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        logger.error('[process-async-jobs] CRON_SECRET environment variable is not set');
        return NextResponse.json(
            { success: false, error: 'Server misconfiguration' },
            { status: 500 }
        );
    }

    const providedToken = authHeader?.replace('Bearer ', '').trim();
    if (providedToken !== cronSecret) {
        logger.warn('[process-async-jobs] Unauthorized cron request');
        return NextResponse.json(
            { success: false, error: 'Unauthorized' },
            { status: 401 }
        );
    }

    try {
        const result = await processNextAsyncJob();
        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error) {
        logger.error('[process-async-jobs] Failed to process async jobs:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

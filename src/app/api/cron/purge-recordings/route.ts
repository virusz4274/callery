import { NextRequest, NextResponse } from 'next/server';
import { purgeExpiredRecordings } from '@/lib/db/retention';
import { logger } from '@/lib/logger';

/**
 * GET /api/cron/purge-recordings
 *
 * Enforces users' automatic deletion policies (Settings → Usage & Storage).
 * Guarded by CRON_SECRET: callers must send
 * `Authorization: Bearer <CRON_SECRET>`. Scheduled via vercel.json on Vercel;
 * any external scheduler works for self-hosted instances.
 */
export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        return NextResponse.json(
            { error: 'CRON_SECRET is not configured.' },
            { status: 500 }
        );
    }

    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const summary = await purgeExpiredRecordings();
        logger.info(
            `[cron/purge-recordings] users=${summary.usersProcessed} deleted=${summary.recordingsDeleted} errors=${summary.errors.length}`
        );
        return NextResponse.json({ success: true, ...summary });
    } catch (error) {
        logger.error('[cron/purge-recordings] failed:', error);
        return NextResponse.json(
            { error: 'Purge job failed' },
            { status: 500 }
        );
    }
}

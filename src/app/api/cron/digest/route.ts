import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { collectDigestStats, digestWindow, sendDigestEmail } from '@/lib/email/notifications';
import type { User } from '@/lib/db/types';
import { logger } from '@/lib/logger';

/**
 * GET /api/cron/digest
 *
 * Sends weekly/monthly activity digests to users who opted in
 * (Settings → Notifications). Runs daily via vercel.json; each preference
 * resolves to at most one send day. Same CRON_SECRET guard as other jobs.
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
        const db = await getMongoDb();
        const now = new Date();
        const users = await db
            .collection<User>(Collections.USERS)
            .find({ 'notificationSettings.activityDigest': { $in: ['weekly', 'monthly'] } })
            .toArray();

        let sent = 0;
        let skipped = 0;
        for (const user of users) {
            const preference = user.notificationSettings?.activityDigest ?? 'off';
            const window = digestWindow(preference, now);
            if (!window) {
                skipped++;
                continue;
            }
            const stats = await collectDigestStats(user.authSubject, window.since);
            const delivered = await sendDigestEmail(user, window.period, stats);
            if (delivered) sent++;
            else skipped++;
        }

        logger.info(`[cron/digest] sent=${sent} skipped=${skipped}`);
        return NextResponse.json({ success: true, sent, skipped });
    } catch (error) {
        logger.error('[cron/digest] failed:', error);
        return NextResponse.json(
            { error: 'Digest job failed' },
            { status: 500 }
        );
    }
}

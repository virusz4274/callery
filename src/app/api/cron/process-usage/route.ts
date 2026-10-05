import { NextRequest, NextResponse } from 'next/server';
import { billingEnabled } from '@/lib/config';
import { env } from '@/lib/env';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { flushUsageEvents } from '@/lib/stripe/usage-queue';

export async function GET(request: NextRequest) {
    if (!isAuthorizedCronRequest(request.headers.get('authorization'), env.CRON_SECRET)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!billingEnabled()) return NextResponse.json({ sent: 0, failed: 0, billingEnabled: false });
    return NextResponse.json(await flushUsageEvents());
}

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { env } from '@/lib/env';
import { processIngestion } from '@/lib/integrations/worker';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function GET(request: NextRequest) {
    if (!isAuthorizedCronRequest(request.headers.get('authorization'), env.CRON_SECRET)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json(await processIngestion(), { headers: { 'Cache-Control': 'no-store' } });
}

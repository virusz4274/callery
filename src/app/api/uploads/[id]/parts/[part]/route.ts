import { NextRequest } from 'next/server';
import { browserUploadApi } from '@/lib/integrations/browser-api';
type Context = { params: Promise<{ id: string; part: string }> };
export const runtime = 'nodejs';
export const maxDuration = 300;
async function dispatch(request: NextRequest, context: Context) {
    const { id, part } = await context.params;
    return browserUploadApi(request, [id, 'parts', part]);
}
export const POST = dispatch;
export const PUT = dispatch;

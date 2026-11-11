import { NextRequest } from 'next/server';
import { browserUploadApi } from '@/lib/integrations/browser-api';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    return browserUploadApi(request, [(await context.params).id, 'complete']);
}

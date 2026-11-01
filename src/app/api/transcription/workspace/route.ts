import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { listTranscriptionWorkspace } from '@/lib/transcription/batches';
import { batchApiError } from '@/lib/transcription/batch-api';

export async function GET(request: NextRequest) {
    try {
        const owner = await getUserFromRequest(request);
        if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const workspace = await listTranscriptionWorkspace(owner, {
            waitingAfter: request.nextUrl.searchParams.get('waitingAfter'),
            batchesAfter: request.nextUrl.searchParams.get('batchesAfter'),
        });
        return NextResponse.json(workspace, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) { return batchApiError(error); }
}

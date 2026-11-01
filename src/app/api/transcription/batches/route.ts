import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { createTranscriptionBatch } from '@/lib/transcription/batches';
import { batchApiError } from '@/lib/transcription/batch-api';

export async function POST(request: NextRequest) {
    try {
        const owner = await getUserFromRequest(request);
        if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const body: unknown = await request.json().catch(() => null);
        return NextResponse.json({ batch: await createTranscriptionBatch(owner, body) }, { status: 201 });
    } catch (error) { return batchApiError(error); }
}

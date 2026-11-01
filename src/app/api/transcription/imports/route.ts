import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { createTranscriptionImport } from '@/lib/transcription/batches';
import { batchApiError } from '@/lib/transcription/batch-api';

export async function POST(request: NextRequest) {
    try {
        const owner = await getUserFromRequest(request);
        if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        return NextResponse.json(await createTranscriptionImport(owner), { status: 201 });
    } catch (error) { return batchApiError(error); }
}

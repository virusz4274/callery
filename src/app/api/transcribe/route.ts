import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { startManualTranscription } from '@/lib/transcription/manual';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
    const subject = await getUserFromRequest(request);
    if (!subject) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body.recordingId !== 'string') {
        return NextResponse.json({ error: 'Missing recordingId' }, { status: 400 });
    }
    const result = await startManualTranscription(subject, body.recordingId, { provider: body.provider, model: body.model });
    return NextResponse.json(result, { status: result.error ? 400 : 202 });
}

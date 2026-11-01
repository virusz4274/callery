import { NextResponse } from 'next/server';
import { ApiError } from '@/lib/integrations/contracts';
import { logger } from '@/lib/logger';

export function batchApiError(error: unknown) {
    if (error instanceof ApiError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    logger.error('Transcription workspace request failed:', error);
    return NextResponse.json({ error: 'Unable to update the transcription workspace. Please retry.' }, { status: 500 });
}

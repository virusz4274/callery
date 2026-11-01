import { after, NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { logger } from '@/lib/logger';
import { updateTranscriptionBatch } from '@/lib/transcription/batches';
import { batchApiError } from '@/lib/transcription/batch-api';

export const maxDuration = 300;

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const owner = await getUserFromRequest(request);
        if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const { id } = await context.params;
        const body: unknown = await request.json().catch(() => null);
        const result = await updateTranscriptionBatch(owner, id, body);
        if (result.batch?.status === 'running') after(async () => {
            try {
                const { processTranscriptionJobs } = await import('@/lib/integrations/jobs');
                await processTranscriptionJobs();
            } catch (error) { logger.error('Batch dispatcher failed; durable work will resume through cron:', error); }
        });
        return NextResponse.json(result);
    } catch (error) { return batchApiError(error); }
}

'use server';

import { after } from 'next/server';
import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { createExportJob, getLatestExportJob, toExportJobResponse } from '@/lib/db/export-jobs';
import { processExport } from '@/lib/export-processor';
import { resolveExportSubject } from '@/lib/team-policy';

export async function startExport(targetUserId?: string) {
    const actorSubject = await getAuthSubjectFromSession();
    const authSubject = actorSubject ? await resolveExportSubject(actorSubject, targetUserId) : null;
    if (!authSubject) {
        throw new Error('Unauthorized');
    }

    // Check for existing pending/processing jobs
    const existingJob = await getLatestExportJob(authSubject);
    if (existingJob && ['pending', 'processing'].includes(existingJob.status)) {
        return { success: false as const, message: 'An export is already in progress.' };
    }

    // Create new job
    const job = await createExportJob({
        authSubject,
        requestedByAuthSubject: actorSubject!,
        status: 'pending',
        progress: 0,
        totalRecordings: 0,
        processedRecordings: 0,
        parts: [],
        checkpoint: {
            nextPartNumber: 1,
        },
    });

    // Local/dev fallback so exports still run without a scheduler.
    // Production should use the cron worker route.
    const shouldRunInline = process.env.NODE_ENV === 'development';

    if (shouldRunInline) {
        after(async () => {
            await processExport(job._id.toString(), authSubject);
        });
    }

    return { success: true as const, jobId: job._id.toString() };
}

export async function getExportStatus(targetUserId?: string) {
    const actorSubject = await getAuthSubjectFromSession();
    const authSubject = actorSubject ? await resolveExportSubject(actorSubject, targetUserId) : null;
    if (!authSubject) return null;

    const job = await getLatestExportJob(authSubject);
    if (!job) return null;

    return toExportJobResponse(job);
}

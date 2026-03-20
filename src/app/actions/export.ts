'use server';

import { after } from 'next/server';
import { getFirebaseUidFromSession } from '@/lib/auth-utils';
import { createExportJob, getLatestExportJob, toExportJobResponse } from '@/lib/db/export-jobs';
import { processExport } from '@/lib/export-processor';

export async function startExport() {
    const firebaseUid = await getFirebaseUidFromSession();
    if (!firebaseUid) {
        throw new Error('Unauthorized');
    }

    // Check for existing pending/processing jobs
    const existingJob = await getLatestExportJob(firebaseUid);
    if (existingJob && ['pending', 'processing'].includes(existingJob.status)) {
        return { success: false, message: 'An export is already in progress.' };
    }

    // Create new job
    const job = await createExportJob({
        firebaseUid,
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
            await processExport(job._id.toString(), firebaseUid);
        });
    }

    return { success: true, jobId: job._id.toString() };
}

export async function getExportStatus() {
    const firebaseUid = await getFirebaseUidFromSession();
    if (!firebaseUid) return null;

    const job = await getLatestExportJob(firebaseUid);
    if (!job) return null;

    return toExportJobResponse(job);
}

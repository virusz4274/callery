'use server';

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
    });

    // Trigger background processing (Detached)
    // In a real serverless env (Vercel), this might be killed.
    // Ideally use Inngest/Next/After. For "local/VPS" this works.
    setTimeout(() => {
        processExport(job._id.toString(), firebaseUid).catch(console.error);
    }, 0);

    return { success: true, jobId: job._id.toString() };
}

export async function getExportStatus() {
    const firebaseUid = await getFirebaseUidFromSession();
    if (!firebaseUid) return null;

    const job = await getLatestExportJob(firebaseUid);
    if (!job) return null;

    return toExportJobResponse(job);
}

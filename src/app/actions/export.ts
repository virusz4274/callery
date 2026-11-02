'use server';

import { after } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { createExportJob, getExportJob, getLatestExportJob, toExportJobResponse } from '@/lib/db/export-jobs';
import { processExport } from '@/lib/export-processor';
import { resolveExportSubject } from '@/lib/team-policy';
import { assertFreshExportWindow, exportBudgetFields, getExportSourceSnapshot, isReusableExport, withExportRequestLease, reserveExportBudget, finishExportBudget, getRecoveryExport, linkRecoveryExportBudget } from '@/lib/export-processor/policy';
import { ARCHIVE_TTL_MS } from '@/lib/export-processor/constants';
import { refreshExportDownloadLinks } from '@/lib/export-processor/downloads';
import { confirmExportJobAdmission } from '@/lib/export-processor/object-lifecycle';
import { assertQueuedExportRetryIdentity, ExportRetryUnavailableError, getExportRetryAvailability, requeueFailedExport } from '@/lib/export-processor/failed-retry';
import { getMongoDb } from '@/lib/mongodb';

export async function startExport(targetUserId?: string) {
    const actorSubject = await getAuthSubjectFromSession();
    const authSubject = actorSubject ? await resolveExportSubject(actorSubject, targetUserId) : null;
    if (!authSubject) {
        throw new Error('Unauthorized');
    }

    return withExportRequestLease(authSubject, async (db, assertOwned) => {
        const recoveryId = await getRecoveryExport(authSubject, db);
        if (recoveryId) {
            const recovery = await getExportJob(recoveryId, authSubject);
            if (recovery && !recovery.cleanedAt && !recovery.cleanupPending && !recovery.abortedAt && (!recovery.archiveExpiresAt || recovery.archiveExpiresAt > new Date()) && recovery.status !== 'failed') {
                return { success: true as const, jobId: recoveryId, cached: true };
            }
            return { success: false as const, message: 'The recovery archive for this billing window is unavailable. Individual recording downloads remain available.' };
        }
        const existingJob = await getLatestExportJob(authSubject);
        if (existingJob && !existingJob.cleanupPending && !existingJob.abortedAt && ['pending', 'processing'].includes(existingJob.status)) return { success: true as const, jobId: existingJob._id.toString(), cached: true };
        const source = await getExportSourceSnapshot(authSubject, db);
        await assertOwned();
        if (existingJob && isReusableExport(existingJob, source.revision)) return { success: true as const, jobId: existingJob._id.toString(), cached: true };
        try { await assertFreshExportWindow(authSubject, db); }
        catch (error) { return { success: false as const, message: error instanceof Error ? error.message : 'The next fresh export window is not available.' }; }
        let budget;
        try { budget = await reserveExportBudget(authSubject, source, db); }
        catch (error) { return { success: false as const, message: error instanceof Error ? error.message : 'Archive generation is unavailable. Individual downloads remain available.' }; }
        let job;
        try { await assertOwned(); job = await createExportJob({
        authSubject,
        requestedByAuthSubject: actorSubject!,
        status: 'pending',
        progress: 0,
        totalRecordings: source.count,
        processedRecordings: 0,
        parts: [],
        checkpoint: {
            nextPartNumber: 1,
        },
        sourceRevision: source.revision, sourceBytes: source.bytes, estimatedArchiveBytes: source.estimatedArchiveBytes,
        archiveExpiresAt: new Date(Date.now() + ARCHIVE_TTL_MS),
        ...exportBudgetFields(budget),
    }, db, budget?.jobId ? new ObjectId(budget.jobId) : undefined); await confirmExportJobAdmission(job, db); } catch (error) { if (budget) await finishExportBudget(authSubject, budget, false, db); throw error; }
    await linkRecoveryExportBudget(authSubject, budget, job._id.toString(), db);

    // Local/dev fallback so exports still run without a scheduler.
    // Production should use the cron worker route.
    const shouldRunInline = process.env.NODE_ENV === 'development';

    if (shouldRunInline) {
        after(async () => {
            await processExport(job._id.toString(), authSubject);
        });
    }

    return { success: true as const, jobId: job._id.toString() };
    });
}

export async function getExportStatus(targetUserId?: string) {
    const actorSubject = await getAuthSubjectFromSession();
    const authSubject = actorSubject ? await resolveExportSubject(actorSubject, targetUserId) : null;
    if (!authSubject) return null;

    const db = await getMongoDb();
    const recoveryId = await getRecoveryExport(authSubject, db);
    const job = recoveryId ? await getExportJob(recoveryId, authSubject, db) : await getLatestExportJob(authSubject, db);
    if (!job) return null;

    const current = await refreshExportDownloadLinks(job);
    const response = toExportJobResponse(current);
    if (current.status !== 'failed') return response;
    try { return { ...response, ...await getExportRetryAvailability(current, db) }; }
    catch { return { ...response, retryAvailable: false, retryUnavailableReason: 'Retry availability could not be checked. Refresh the export status and try again.' }; }
}

export async function retryExport(jobId: string, targetUserId?: string) {
    const actorSubject = await getAuthSubjectFromSession();
    const authSubject = actorSubject ? await resolveExportSubject(actorSubject, targetUserId) : null;
    if (!authSubject) throw new Error('Unauthorized');
    if (typeof jobId !== 'string' || !ObjectId.isValid(jobId)) return { success: false as const, message: 'Export job not found.' };

    try {
        return await withExportRequestLease(authSubject, async (db, assertOwned) => {
            const job = await getExportJob(jobId, authSubject, db);
            if (!job) return { success: false as const, message: 'Export job not found.' };
            if (['pending', 'processing'].includes(job.status)) {
                await assertQueuedExportRetryIdentity(job, db);
                return { success: true as const, jobId, cached: true };
            }
            await requeueFailedExport(job, actorSubject!, db, assertOwned);
            await confirmExportJobAdmission(job, db);
            if (process.env.NODE_ENV === 'development') {
                after(async () => { await processExport(jobId, authSubject); });
            }
            return { success: true as const, jobId };
        });
    } catch (error) {
        return { success: false as const, message: error instanceof ExportRetryUnavailableError
            ? error.message : 'The export retry could not be prepared. Refresh its status and try again.' };
    }
}

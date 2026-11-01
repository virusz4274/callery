import { ObjectId, type Db } from 'mongodb';
import { Collections } from '@/lib/mongodb';
import type { User } from '@/lib/db/types';
import { createExportJob, getExportJob, getLatestExportJob } from '@/lib/db/export-jobs';
import { ARCHIVE_TTL_MS } from './constants';
import { exportBudgetFields, finishExportBudget, getExportSourceSnapshot, getRecoveryExport, isReusableExport, linkRecoveryExportBudget, reserveExportBudget, withExportRequestLease } from './policy';
import { confirmExportJobAdmission } from './object-lifecycle';

/** Internal recovery worker API. Its caller must already own cron/admin authorization. */
export async function ensureRecoveryExport(subject: string, db: Db): Promise<{ jobId?: string; warning?: string }> {
    try {
        return await withExportRequestLease(subject, async (_database, assertOwned) => {
            const user = await db.collection<User>(Collections.USERS).findOne({ authSubject: subject });
            const recovery = user?.billingRecovery;
            if (!user || !recovery || recovery.purgingAt || recovery.purgedAt || recovery.purgeAt <= new Date()) return { warning: 'The recovery window has ended.' };
            const previousId = await getRecoveryExport(subject, db);
            if (previousId) {
                const previous = await getExportJob(previousId, subject, db);
                return previous && !previous.cleanedAt && !previous.cleanupPending && !previous.abortedAt && previous.status !== 'failed' && (!previous.archiveExpiresAt || previous.archiveExpiresAt > new Date())
                    ? { jobId: previousId } : { warning: 'The recovery archive for this window is unavailable. Individual recording downloads remain available.' };
            }
            const snapshot = await getExportSourceSnapshot(subject, db);
            await assertOwned();
            const latest = await getLatestExportJob(subject, db);
            if (latest && !latest.cleanupPending && !latest.abortedAt && (['pending', 'processing'].includes(latest.status) || isReusableExport(latest, snapshot.revision))) {
                await db.collection<User>(Collections.USERS).updateOne({ authSubject: subject, 'billingRecovery.startedAt': recovery.startedAt }, { $set: { 'billingRecovery.exportJobId': latest._id.toString() } });
                return { jobId: latest._id.toString() };
            }
            const budget = await reserveExportBudget(subject, snapshot, db);
            let job;
            try {
                await assertOwned();
                job = await createExportJob({ authSubject: subject, requestedByAuthSubject: subject, status: 'pending', progress: 0,
                    totalRecordings: snapshot.count, processedRecordings: 0, parts: [], checkpoint: { nextPartNumber: 1 },
                    sourceRevision: snapshot.revision, sourceBytes: snapshot.bytes, estimatedArchiveBytes: snapshot.estimatedArchiveBytes,
                    archiveExpiresAt: new Date(Date.now() + ARCHIVE_TTL_MS),
                    ...exportBudgetFields(budget),
                }, db, budget?.jobId ? new ObjectId(budget.jobId) : undefined);
                await confirmExportJobAdmission(job, db);
            } catch (error) { if (budget) await finishExportBudget(subject, budget, false, db); throw error; }
            await linkRecoveryExportBudget(subject, budget, job._id.toString(), db);
            return { jobId: job._id.toString() };
        }, db);
    } catch (error) { return { warning: error instanceof Error ? error.message : 'Recovery archive generation is unavailable. Individual downloads remain available.' }; }
}

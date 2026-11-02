import { ObjectId, type Db } from 'mongodb';
import type { ExportJob, User } from '@/lib/db/types';
import { getLatestExportJob } from '@/lib/db/export-jobs';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { ledgerKey, type CostReservation } from '@/lib/stripe/ledger';
import { getOperatorCost } from '@/lib/stripe/legacy-operator-costs';
import { ARCHIVE_TTL_MS } from './constants';
import { isRetryableExportFailure } from './errors';
import { verifyCheckpointParts } from './object-lifecycle';
import { getExportSourceSnapshot, getRecoveryExport } from './policy';

export type ExportRetryAvailability = { retryAvailable: boolean; retryUnavailableReason?: string };

export class ExportRetryUnavailableError extends Error {}

const freshExportGuidance = 'Request a new export when the next fresh export window opens. Individual recording downloads remain available.';

/** Historical failed jobs have already consumed their original generation. */
export function failedExportAttempts(job: ExportJob): number {
    return job.generationAttempts ?? 1;
}

function checkpointIsCoherent(job: ExportJob): boolean {
    const { checkpoint, parts, processedRecordings, totalRecordings } = job;
    if (!checkpoint || !Array.isArray(parts) || !Number.isSafeInteger(processedRecordings) || processedRecordings < 0
        || !Number.isSafeInteger(totalRecordings) || totalRecordings < processedRecordings
        || checkpoint.nextPartNumber !== parts.length + 1) return false;
    if (processedRecordings === 0) {
        if (parts.length || checkpoint.cursorId || checkpoint.cursorRecordedAt) return false;
    } else if (!parts.length || !checkpoint.cursorId || !ObjectId.isValid(checkpoint.cursorId)
        || !(checkpoint.cursorRecordedAt instanceof Date) || !Number.isFinite(checkpoint.cursorRecordedAt.getTime())) return false;
    const prefix = `exports/${job.authSubject}/${job._id.toString()}/`;
    return new Set(parts.map(part => part.key)).size === parts.length
        && parts.every(part => typeof part.key === 'string' && part.key.startsWith(prefix) && Number.isSafeInteger(part.size) && part.size > 0);
}

function basicRetryReason(job: ExportJob, now = new Date()): string | undefined {
    if (job.status !== 'failed') return 'This export is already queued, running, or complete.';
    const archiveReason = unavailableArchiveReason(job, now);
    if (archiveReason) return archiveReason;
    const attempts = failedExportAttempts(job);
    if (!Number.isSafeInteger(attempts) || attempts < 0 || attempts >= 2) return `This export has used its single retry. ${freshExportGuidance}`;
    if (!isRetryableExportFailure(job.failure, job.error)) return `This failure cannot be retried. ${freshExportGuidance}`;
    if (!job.sourceRevision || !checkpointIsCoherent(job)) return `This older export cannot be safely resumed. ${freshExportGuidance}`;
    return undefined;
}

function unavailableArchiveReason(job: ExportJob, now = new Date()): string | undefined {
    if (job.cleanedAt || job.cleanupPending || job.abortedAt) return 'This archive is being removed and cannot be retried.';
    const expiresAt = job.archiveExpiresAt || new Date(job.createdAt.getTime() + ARCHIVE_TTL_MS);
    if (expiresAt <= now) return `This archive has expired. ${freshExportGuidance}`;
    return undefined;
}

async function legacyFundingAvailable(job: ExportJob, user: User, db: Db): Promise<boolean> {
    if (!job.costReservationId) return true;
    if (!Number.isSafeInteger(job.maximumCostMicros) || job.maximumCostMicros! < 0) return false;
    // A released hold cannot authorize a new external call. Started work may
    // retain its already settled cap for the one bounded recovery generation.
    if (job.costSettledAt && !job.costStartedAt) return false;
    if (!job.costBudgetSource || job.costBudgetSource === 'customer') {
        const row = user.billingAccount?.reservations[ledgerKey(job.costReservationId)]
            || (await db.collection<{ _id: string; data: CostReservation }>('billing_financial_archive').findOne({
                _id: ledgerKey(`${job.authSubject}:reservation:${job.costReservationId}`),
            }))?.data;
        return Boolean(row && row.id === job.costReservationId && row.kind === 'export' && row.maximumCostMicros === job.maximumCostMicros
            && (row.state === 'reserved' || row.state === 'settled' && job.costStartedAt && row.actualCostMicros === job.maximumCostMicros));
    }
    if (['trial', 'grant', 'internal'].includes(job.costBudgetSource)) {
        const row = await getOperatorCost(job.authSubject, job.costReservationId, db);
        return Boolean(row && row.kind === 'export' && row.maximumCostMicros === job.maximumCostMicros
            && (row.state === 'reserved' || row.state === 'settled' && job.costStartedAt && row.actualCostMicros === job.maximumCostMicros));
    }
    if (!job.costBudgetPoolId) return false;
    const key = job.costReservationId.replace(/^recovery-export:/, '');
    const pool = await db.collection<{ _id: string; receipts?: Record<string, { subject: string; maximumCostMicros: number; state: string }> }>('export_recovery_pools')
        .findOne({ _id: job.costBudgetPoolId });
    const receipt = pool?.receipts?.[key];
    return Boolean(receipt && receipt.subject === job.authSubject && receipt.maximumCostMicros === job.maximumCostMicros
        && (receipt.state === 'reserved' || receipt.state === 'spent' && job.costStartedAt));
}

async function retryIdentity(job: ExportJob, db: Db): Promise<{ user?: User; reason?: string }> {
    const user = await db.collection<User>(Collections.USERS).findOne({ authSubject: job.authSubject });
    if (!user || user.softDelete?.isDeleted || user.billingRecovery?.purgingAt || user.billingRecovery?.purgedAt) {
        return { reason: 'This archive is being removed and cannot be retried.' };
    }
    if (user.billingRecovery) {
        if (user.billingRecovery.purgeAt <= new Date()) return { reason: 'The recovery archive window has ended.' };
        if (await getRecoveryExport(job.authSubject, db) !== job._id.toString()) {
            return { reason: 'Use the recovery archive for the current billing window. Individual recording downloads remain available.' };
        }
    } else if ((await getLatestExportJob(job.authSubject, db))?._id.toString() !== job._id.toString()) {
        return { reason: 'Only the latest failed export can be retried.' };
    }
    return { user };
}

/** A duplicate request may return the same admitted retry, never an older archive. */
export async function assertQueuedExportRetryIdentity(job: ExportJob, db: Db): Promise<void> {
    const reason = unavailableArchiveReason(job) || (await retryIdentity(job, db)).reason;
    if (reason) throw new ExportRetryUnavailableError(reason);
}

/** Read-only UI eligibility; storage is verified by the explicit retry action. */
export async function getExportRetryAvailability(job: ExportJob, database?: Db): Promise<ExportRetryAvailability> {
    const unavailable = (reason: string): ExportRetryAvailability => ({ retryAvailable: false, retryUnavailableReason: reason });
    const reason = basicRetryReason(job);
    if (reason) return unavailable(reason);
    const db = database || await getMongoDb();
    const identity = await retryIdentity(job, db);
    if (identity.reason || !identity.user) return unavailable(identity.reason || 'This archive is unavailable.');
    if (!await legacyFundingAvailable(job, identity.user, db)) return unavailable(`The original archive funding is unavailable. ${freshExportGuidance}`);
    if ((await getExportSourceSnapshot(job.authSubject, db)).revision !== job.sourceRevision) {
        return unavailable(`Recordings changed after this export was created. ${freshExportGuidance}`);
    }
    return { retryAvailable: true };
}

/** Call under the account's export request lease after authenticating the actor. */
export async function requeueFailedExport(job: ExportJob, actorSubject: string, db: Db, assertOwned: () => Promise<void>): Promise<void> {
    const availability = await getExportRetryAvailability(job, db);
    if (!availability.retryAvailable) throw new ExportRetryUnavailableError(availability.retryUnavailableReason);
    try { await verifyCheckpointParts(job, db); }
    catch { throw new ExportRetryUnavailableError(`The saved archive parts could not be verified. ${freshExportGuidance}`); }
    await assertOwned();
    const attempts = failedExportAttempts(job);
    const result = await db.collection<ExportJob>(Collections.EXPORT_JOBS).updateOne({
        _id: job._id, authSubject: job.authSubject, status: 'failed', updatedAt: job.updatedAt,
        cleanupPending: { $ne: true }, abortedAt: { $exists: false }, cleanedAt: { $exists: false },
        generationAttempts: job.generationAttempts === undefined ? { $exists: false } : job.generationAttempts,
        ...(job.archiveExpiresAt ? { archiveExpiresAt: { $gt: new Date() } } : { createdAt: { $gt: new Date(Date.now() - ARCHIVE_TTL_MS) } }),
    }, {
        $set: { status: 'pending', requestedByAuthSubject: actorSubject, generationAttempts: attempts, updatedAt: new Date() },
        $unset: { error: '', failure: '', workerToken: '', workerLeaseUntil: '', completedAt: '' },
    });
    if (!result.matchedCount) throw new ExportRetryUnavailableError('This export changed while its retry was being prepared. Refresh its status and try again.');
}

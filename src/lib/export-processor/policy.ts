import { createHash, randomUUID } from 'node:crypto';
import { ObjectId, type Db } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { Recording, User } from '@/lib/db/types';
import { billingEnabled } from '@/lib/config';
import { ensurePaidBaseForNewWork, releasePrepaidReservation, settlePrepaidReservation } from '@/lib/stripe/ledger';
import { releaseOperatorCost, settleOperatorCost } from '@/lib/stripe/legacy-operator-costs';
import { resolveFundingSource } from '@/lib/stripe/funding-source';
import { sourcePlanUsableWhileAwaitingPayment } from '@/lib/stripe/billing-types';
import { EXPORT_CACHE_MS } from './constants';

export interface ExportSourceSnapshot { revision: string; bytes: number; estimatedArchiveBytes: number; count: number }
/** Hash every document revision: a max(updatedAt) alone misses edits to older rows. */
export async function getExportSourceSnapshot(subject: string, database?: Db): Promise<ExportSourceSnapshot> {
    const db = database || await getMongoDb();
    const hash = createHash('sha256');
    let bytes = 0, estimatedArchiveBytes = 4096, count = 0;
    const rows = db.collection<Recording>(Collections.RECORDINGS).aggregate<{ _id: import('mongodb').ObjectId; updatedAt: Date; fileSize: number; documentBytes: number }>([
        { $match: { authSubject: subject } }, { $project: { _id: 1, updatedAt: 1, fileSize: 1, documentBytes: { $bsonSize: '$$ROOT' } } }, { $sort: { _id: 1 } },
    ]);
    for await (const row of rows) {
        if (billingEnabled() && (!Number.isSafeInteger(row.fileSize) || row.fileSize <= 0)) throw new Error('Recording sizes must be verified before generating an archive. Individual recording downloads remain available.');
        const size = Math.max(0, row.fileSize || 0);
        hash.update(`${row._id}:${new Date(row.updatedAt).toISOString()}:${size};`);
        bytes += size;
        // JSON escaping and TXT copies can be larger than BSON. Keep a
        // conservative physical bound for archive/network/storage work.
        estimatedArchiveBytes += size + Math.max(0, row.documentBytes || 0) * 8 + 4096;
        count++;
    }
    if (![bytes, estimatedArchiveBytes].every(Number.isSafeInteger)) throw new Error('This export exceeds the supported size.');
    return { revision: hash.digest('hex'), bytes, estimatedArchiveBytes, count };
}

export function isReusableExport(job: { status: string; sourceRevision?: string; cacheEligible?: boolean; completedAt?: Date; archiveExpiresAt?: Date; cleanedAt?: Date; cleanupPending?: boolean; abortedAt?: Date }, revision: string, now = new Date()) {
    return job.status === 'completed' && job.cacheEligible !== false && job.sourceRevision === revision && !job.cleanedAt && !job.cleanupPending && !job.abortedAt
        && Boolean(job.completedAt && now.getTime() - job.completedAt.getTime() < EXPORT_CACHE_MS && job.archiveExpiresAt && job.archiveExpiresAt > now);
}

/** Serialize creation across tabs/devices; an expired lease is safe to recover. */
export async function withExportRequestLease<T>(subject: string, work: (db: Db, assertOwned: () => Promise<void>) => Promise<T>, database?: Db): Promise<T> {
    const db = database || await getMongoDb();
    const owner = randomUUID(), now = new Date();
    const leases = db.collection<{ _id: string; owner?: string; until?: Date }>('export_request_leases');
    try { await leases.updateOne({ _id: subject }, { $setOnInsert: { until: new Date(0) } }, { upsert: true }); }
    catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
    const claimed = await leases.updateOne({ _id: subject, until: { $lte: now } }, { $set: { owner, until: new Date(now.getTime() + 120_000) } });
    if (!claimed.matchedCount) throw new Error('Another export request is being prepared. Retry shortly.');
    const assertOwned = async () => {
        if (!await leases.findOne({ _id: subject, owner, until: { $gt: new Date() } })) throw new Error('The export request lease expired. Retry shortly.');
    };
    const heartbeat = setInterval(() => { void leases.updateOne({ _id: subject, owner, until: { $gt: new Date() } }, {
        $set: { until: new Date(Date.now() + 120_000) },
    }).catch(() => {}); }, 30_000);
    heartbeat.unref();
    try { return await work(db, assertOwned); }
    finally { clearInterval(heartbeat); await leases.updateOne({ _id: subject, owner }, { $set: { until: new Date(0) }, $unset: { owner: '' } }); }
}

export interface ExportBudget {
    version?: 2; id: string; maximumCostMicros?: number; source: 'customer' | 'operator' | 'trial' | 'grant' | 'internal' | 'recovery';
    poolId?: string; recoveryWindow?: Date; jobId?: string; unpriced?: boolean; estimateStale?: boolean; costPolicyVersion?: string;
}
interface RecoveryPool { _id: string; limitMicros: number; committedMicros: number; count: number; createdAt: Date; receipts?: Record<string, { subject: string; maximumCostMicros: number; state: string; finishedAt?: Date }> }
interface RecoveryClaim {
    _id: string; subject: string; version?: 2; poolId?: string; maximumCostMicros?: number; reservationId: string; createdAt: Date;
    state?: 'prepared' | 'funded' | 'linked' | 'released'; jobId?: string; sourceRevision?: string;
}

/** Call under withExportRequestLease. Content edits do not replenish generation. */
export async function assertFreshExportWindow(subject: string, db: Db, now = new Date()): Promise<void> {
    const user = await db.collection<User>(Collections.USERS).findOne({ authSubject: subject });
    if (user?.billingRecovery && resolveFundingSource(user, true) !== 'internal') return;
    const recent = await db.collection<import('@/lib/db/types').ExportJob>(Collections.EXPORT_JOBS).findOne({
        authSubject: subject, createdAt: { $gt: new Date(now.getTime() - EXPORT_CACHE_MS) },
        costBudgetSource: { $nin: ['operator', 'recovery'] }, exportAccessSource: { $ne: 'recovery' },
    });
    if (recent) throw new Error('One fresh full archive is available per 24 hours. Use the existing archive or individual recording downloads until the next window.');
}

export async function reserveExportBudget(subject: string, snapshot: ExportSourceSnapshot, db: Db): Promise<ExportBudget | undefined> {
    const account = await db.collection<User>(Collections.USERS).findOne({ authSubject: subject });
    if (!account || account.disabled || account.softDelete?.isDeleted || account.billingRecovery?.purgingAt || account.billingRecovery?.purgedAt) throw new Error('This archive is being removed; generation is unavailable.');
    if (!billingEnabled()) return undefined;
    const source = resolveFundingSource(account, true);
    // A physical resource bound is independent of provider pricing or cash.
    if (snapshot.estimatedArchiveBytes > 2 * 1024 ** 4) throw new Error('This archive exceeds the supported export size. Download recordings individually or contact support.');
    if (!source) throw new Error('Verify the account entitlement before generating an archive.');
    if (source === 'selfhost') return undefined;
    const trialEnded = source === 'trial' && (!(account.trialEndsAt instanceof Date) || account.trialEndsAt <= new Date());
    const unpaid = source === 'customer' && (Object.keys(account.stripePaymentIssues || {}).length > 0
        || ['past_due', 'unpaid', 'canceled', 'incomplete_expired'].includes(account.stripeSubscriptionStatus || '')
        || account.billingOperation?.state === 'awaiting_payment' && !sourcePlanUsableWhileAwaitingPayment(account));
    if (source !== 'internal' && !account.billingRecovery && (trialEnded || unpaid)) {
        throw new Error('Billing recovery is being synchronized. Retry the recovery archive shortly; individual recording downloads remain available.');
    }
    if (source !== 'internal' && account.billingRecovery) return reserveRecoveryExport(subject, snapshot, db);
    await ensurePaidBaseForNewWork(account, db);
    return { version: 2, id: `export:${subject}:${randomUUID()}`, source };
}

export function exportBudgetFields(budget: ExportBudget | undefined) {
    if (budget?.version === 2) return { exportAdmissionVersion: 2 as const, exportAccessSource: budget.source,
        ...(budget.source === 'recovery' ? { recoveryClaimId: budget.id } : {}) };
    return budget ? { costReservationId: budget.id, maximumCostMicros: budget.maximumCostMicros, costBudgetSource: budget.source,
        costBudgetPoolId: budget.poolId, costUnpriced: budget.unpriced, costEstimateStale: budget.estimateStale, costPolicyVersion: budget.costPolicyVersion } : {};
}

export async function linkRecoveryExportBudget(subject: string, budget: ExportBudget | undefined, jobId: string, db: Db): Promise<void> {
    if (!budget?.recoveryWindow) return;
    await db.collection<User>(Collections.USERS).updateOne({ authSubject: subject, 'billingRecovery.startedAt': budget.recoveryWindow }, { $set: { 'billingRecovery.exportJobId': jobId } });
    await db.collection<RecoveryClaim>('export_recovery_claims').updateOne({ subject, reservationId: budget.id }, { $set: { jobId, state: 'linked' } });
}

/** One recoverable archive identity per recovery window; no dollar pool. */
async function reserveRecoveryExport(subject: string, snapshot: ExportSourceSnapshot, db: Db): Promise<ExportBudget> {
    const user = await db.collection<User>(Collections.USERS).findOne({ authSubject: subject });
    const window = user?.billingRecovery?.startedAt;
    if (!window || user?.billingRecovery?.purgingAt || user?.billingRecovery?.purgedAt || user!.billingRecovery!.purgeAt <= new Date()) throw new Error('The recovery archive window has ended.');
    const key = createHash('sha256').update(`${subject}:${window.toISOString()}`).digest('hex'), recoveryId = `recovery-export:${key}`;
    const claims = db.collection<RecoveryClaim>('export_recovery_claims'), jobId = new ObjectId(key.slice(0, 24)).toString();
    try { await claims.updateOne({ _id: key }, { $setOnInsert: { version: 2, subject, reservationId: recoveryId,
        jobId, sourceRevision: snapshot.revision, state: 'prepared', createdAt: new Date() } }, { upsert: true }); }
    catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
    const claim = await claims.findOne({ _id: key });
    if (!claim || claim.subject !== subject || claim.reservationId !== recoveryId || claim.state === 'released'
        || claim.sourceRevision && claim.sourceRevision !== snapshot.revision) throw new Error('The accepted recovery archive source changed. Existing downloads remain available.');
    if (claim.version !== 2) {
        // Existing funded claims keep their accepted evidence and deterministic job.
        return { id: recoveryId, maximumCostMicros: claim.maximumCostMicros, source: 'recovery', poolId: claim.poolId, recoveryWindow: window, jobId: claim.jobId || jobId };
    }
    return { version: 2, id: recoveryId, source: 'recovery', recoveryWindow: window, jobId: claim.jobId || jobId };
}

export async function finishExportBudget(subject: string, budget: ExportBudget, spent: boolean, db: Db) {
    if (budget.version === 2) {
        if (budget.source !== 'recovery') return;
        const job = await db.collection<import('@/lib/db/types').ExportJob>(Collections.EXPORT_JOBS).findOne({ authSubject: subject, recoveryClaimId: budget.id });
        await db.collection<RecoveryClaim>('export_recovery_claims').updateOne({ subject, reservationId: budget.id },
            { $set: { state: job ? 'linked' : 'prepared', ...(job ? { jobId: job._id.toString() } : {}) } });
        return;
    }
    if (budget.maximumCostMicros === undefined) throw new Error('Legacy export expense evidence is unavailable.');
    if (budget.source === 'customer') {
        if (spent) await settlePrepaidReservation(subject, budget.id, { actualCostMicros: budget.maximumCostMicros, chargedMicros: 0, outcome: 'completed', costBasis: 'committed_cap' }, db);
        else await releasePrepaidReservation(subject, budget.id, db);
        return;
    }
    if (budget.source === 'trial' || budget.source === 'grant' || budget.source === 'internal') {
        if (spent) await settleOperatorCost(subject, budget.id, { actualCostMicros: budget.maximumCostMicros, outcome: 'completed', costBasis: budget.unpriced ? 'unpriced' : budget.estimateStale ? 'stale_estimate' : 'committed_cap',
            evidence: { provider: 'storage', model: 'archive', source: budget.unpriced ? 'unknown_cost' : 'committed_cap', measured: false } }, db);
        else await releaseOperatorCost(subject, budget.id, db);
        return;
    }
    const key = budget.id.replace(/^recovery-export:/, '');
    const pools = db.collection<RecoveryPool>('export_recovery_pools');
    if (spent) await pools.updateOne({ _id: budget.poolId }, { $set: { [`receipts.${key}.state`]: 'spent', [`receipts.${key}.finishedAt`]: new Date() } });
    else {
        const released = await pools.updateOne({ _id: budget.poolId, [`receipts.${key}.state`]: 'reserved' }, { $inc: { committedMicros: -budget.maximumCostMicros, count: -1 }, $unset: { [`receipts.${key}`]: '' } });
        if (released.matchedCount) {
            const job = await db.collection<import('@/lib/db/types').ExportJob>(Collections.EXPORT_JOBS).findOne({ authSubject: subject, costReservationId: budget.id });
            await db.collection<RecoveryClaim>('export_recovery_claims').updateOne({ _id: key }, { $set: { state: job ? 'released' : 'prepared' } });
        }
    }
}

export async function getRecoveryExport(subject: string, db: Db): Promise<string | undefined> {
    const user = await db.collection<User>(Collections.USERS).findOne({ authSubject: subject });
    if (user?.billingRecovery?.exportJobId) return user.billingRecovery.exportJobId;
    const window = user?.billingRecovery?.startedAt;
    if (!window) return;
    const key = createHash('sha256').update(`${subject}:${window.toISOString()}`).digest('hex');
    const job = await db.collection<import('@/lib/db/types').ExportJob>(Collections.EXPORT_JOBS).findOne({ authSubject: subject, $or: [{ recoveryClaimId: `recovery-export:${key}` }, { costReservationId: `recovery-export:${key}` }] });
    return job?._id.toString();
}

import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { ObjectId, type Db, type Filter } from 'mongodb';
import type { User, Recording, ExportJob } from '@/lib/db/types';
import { Collections } from '@/lib/mongodb';
import { deleteFromR2 } from '@/lib/r2';
import { removeStoredObjects } from '@/lib/storage-cleanup';
import { ensureBillingPeriod } from './ledger';
import { ensureRecoveryExport } from '@/lib/export-processor/recovery';
import { refreshBillingForPurge } from './reconcile';
import { getStripe } from '@/lib/stripe';
import { revokeExportObjects } from '@/lib/export-processor/object-lifecycle';
import { billingEnabled } from '@/lib/config';
import { PrepaidFundingRequiredError } from './billing-errors';
import { sourcePlanUsableWhileAwaitingPayment } from './billing-types';
import { resolveFundingSource } from './funding-source';
import { hasBlockingFinancialReview, hasBlockingBillingReview } from './financial-review';

export const RECOVERY_DAYS = 30;
export const RECOVERY_WARNING_DAYS = [0, 23, 29] as const;
export function recoveryDeadline(start: Date): Date { return new Date(start.getTime() + RECOVERY_DAYS * 86400_000); }
export function recoveryWarningDays(start: Date, now: Date): number[] {
    return RECOVERY_WARNING_DAYS.filter(day => now.getTime() >= start.getTime() + day * 86400_000);
}
export function hasUnpaidService(user: User): boolean {
    if (resolveFundingSource(user, true) === 'internal') return false;
    return Object.keys(user.stripePaymentIssues || {}).length > 0
        || ['past_due', 'unpaid', 'canceled', 'incomplete_expired'].includes(user.stripeSubscriptionStatus || '')
        || (user.billingOperation?.state === 'awaiting_payment' && !sourcePlanUsableWhileAwaitingPayment(user));
}
export function expiredTrialStart(user: User, now = new Date()): Date | undefined {
    return user.billingEntitlement?.source === 'trial' && user.trialEndsAt instanceof Date
        && Number.isFinite(user.trialEndsAt.getTime()) && user.trialEndsAt <= now ? user.trialEndsAt : undefined;
}
function entitlementSnapshot(user: User): Filter<User> {
    return { _id: user._id, planKey: user.planKey, billingEntitlement: user.billingEntitlement ?? { $exists: false },
        trialEndsAt: user.trialEndsAt ?? { $exists: false }, stripeCustomerId: user.stripeCustomerId ?? { $exists: false },
        stripeSubscriptionId: user.stripeSubscriptionId ?? { $exists: false }, pendingCheckout: user.pendingCheckout ?? { $exists: false },
        billingOperation: user.billingOperation ?? { $exists: false }, billingReview: user.billingReview ?? { $exists: false }, 'billingAccount.costReview': user.billingAccount?.costReview ?? { $exists: false }, disabled: { $ne: true }, 'softDelete.isDeleted': { $ne: true } };
}

/** Login, reads and export do not extend this clock. Billing configuration
 * outages alone do not authorize deleting a paid customer's archive. */
export async function processBillingRecovery(db: Db, limit = 50, removeObject = deleteFromR2) {
    const users = db.collection<User>(Collections.USERS);
    const result = { started: 0, restored: 0, purged: 0, failed: 0 };
    if (!billingEnabled()) return result;
    // Internal storage is an observable operator expense. Neither old customer
    // debt nor a missing customer cost catalog authorizes media deletion.
    for (const internal of await users.find({ planKey: 'internal', disabled: { $ne: true }, 'softDelete.isDeleted': { $ne: true } }).sort({ billingRecoveryCheckedAt: 1 }).limit(limit).toArray()) {
        if (resolveFundingSource(internal, true) !== 'internal') continue;
        try {
            await users.updateOne({ _id: internal._id }, { $set: { billingRecoveryCheckedAt: new Date() } });
        } catch { result.failed++; }
    }
    const eligible = { 'billingEntitlement.source': { $in: ['subscription', 'lifetime', 'trial'] }, disabled: { $ne: true }, 'softDelete.isDeleted': { $ne: true } };
    const recovering = await users.find({ ...eligible, billingRecovery: { $exists: true }, 'billingRecovery.purgedAt': { $exists: false } }).sort({ billingRecoveryCheckedAt: 1 }).limit(limit).toArray();
    const purged = await users.find({ ...eligible, 'billingRecovery.purgedAt': { $exists: true } }).sort({ billingRecoveryCheckedAt: 1 }).limit(10).toArray();
    const accounts = [...recovering, ...purged, ...await users.find({ ...eligible, billingRecovery: { $exists: false } }).sort({ billingRecoveryCheckedAt: 1 }).limit(limit).toArray()];
    for (let user of accounts) {
        try {
            await users.updateOne({ _id: user._id }, { $set: { billingRecoveryCheckedAt: new Date() } });
            if (hasBlockingBillingReview(user.billingReview) || hasBlockingFinancialReview(user.billingAccount)) throw new Error('Resolve billing and cost review before changing archive retention.');
            const trialStart = expiredTrialStart(user);
            let unpaid = Boolean(trialStart) || hasUnpaidService(user);
            if (!unpaid && user.stripeSubscriptionStatus === 'active' && user.stripeMetering && !hasBlockingBillingReview(user.billingReview)) {
                try { await ensureBillingPeriod(user.authSubject, db); }
                catch (error) {
                    // Only a funding refusal starts retention; a database outage,
                    // configuration problem or busy CAS must be retried safely.
                    if (error instanceof PrepaidFundingRequiredError) unpaid = true;
                    else throw error;
                }
            }
            if (!unpaid && !user.billingRecovery?.purgingAt) {
                if (user.billingRecovery && user.billingEntitlement?.source === 'trial' && user.trialEndsAt instanceof Date && user.trialEndsAt > new Date()) {
                    const restored = await users.updateOne({ ...entitlementSnapshot(user), billingRecovery: user.billingRecovery }, { $unset: { billingRecovery: '' } });
                    if (restored.modifiedCount) result.restored++;
                }
                if (user.billingRecovery && !hasBlockingBillingReview(user.billingReview) && user.stripeSubscriptionStatus === 'active' && user.stripeMetering) {
                    const restored = await users.updateOne({ _id: user._id, billingRecovery: user.billingRecovery, stripePaymentIssues: user.stripePaymentIssues ?? { $exists: false },
                        billingReview: user.billingReview ?? { $exists: false }, 'billingAccount.costReview': user.billingAccount?.costReview ?? { $exists: false } }, { $unset: { billingRecovery: '' } });
                    if (restored.modifiedCount) result.restored++;
                }
                continue;
            }
            if (!user.billingRecovery) {
                const start = trialStart || new Date();
                const started = await users.updateOne({ ...entitlementSnapshot(user), billingRecovery: { $exists: false } }, { $set: { billingRecovery: { startedAt: start, purgeAt: recoveryDeadline(start), warnings: [] } } });
                if (!started.modifiedCount) continue;
                user = (await users.findOne({ _id: user._id }))!;
                result.started++;
            }
            const recovery = user.billingRecovery!;
            if (!recovery.exportJobId && recovery.purgeAt > new Date()) {
                try { await ensureRecoveryExport(user.authSubject, db); } catch { /* Retention warnings and cleanup continue when export budget is unavailable. */ }
            }
            for (const day of recoveryWarningDays(recovery.startedAt, new Date())) {
                const id = new ObjectId(createHash('sha256').update(`${user.authSubject}:${recovery.startedAt.toISOString()}:${day}`).digest('hex').slice(0, 24));
                await db.collection(Collections.NOTIFICATIONS).updateOne({ _id: id }, { $setOnInsert: { userId: user._id, type: 'warning', title: 'Your archive needs billing recovery',
                    message: `Restore billing or export your recordings before ${recovery.purgeAt.toISOString().slice(0, 10)}. Unfunded recordings and export archives are removed after 30 days.`, link: '/settings?tab=billing', isRead: false, createdAt: new Date() } }, { upsert: true });
                await users.updateOne({ _id: user._id, 'billingRecovery.startedAt': recovery.startedAt }, { $addToSet: { 'billingRecovery.warnings': day } });
            }
            if (recovery.purgeAt > new Date() || recovery.purgedAt) continue;
            const before = await users.findOne({ _id: user._id });
            if (!before || (trialStart && !expiredTrialStart(before))) continue;
            if (!recovery.purgingAt && trialStart && !before.stripeCustomerId) {
                if (before.stripeSubscriptionId || before.lifetimePurchase || before.billingOperation
                    || (before.pendingCheckout && !['expired', 'failed'].includes(before.pendingCheckout.phase))) throw new Error('Resolve the trial purchase result before deleting its archive.');
            } else if (!recovery.purgingAt && (await refreshBillingForPurge(user.authSubject, { db, stripe: getStripe() })).funded) {
                const restored = await users.updateOne({ _id: user._id, 'billingRecovery.startedAt': recovery.startedAt, 'billingRecovery.purgingAt': { $exists: false },
                    billingReview: user.billingReview ?? { $exists: false }, 'billingAccount.costReview': user.billingAccount?.costReview ?? { $exists: false } }, { $unset: { billingRecovery: '' } });
                if (restored.modifiedCount) result.restored++;
                continue;
            }
            const fresh = await users.findOne({ _id: user._id });
            if (!fresh?.billingRecovery || fresh.billingRecovery.startedAt.getTime() !== recovery.startedAt.getTime()) continue;
            if (hasBlockingBillingReview(fresh.billingReview) || hasBlockingFinancialReview(fresh.billingAccount)) throw new Error('Resolve billing and cost review before claiming archive deletion.');
            if (resolveFundingSource(fresh, true) === 'internal') continue;
            if (!isDeepStrictEqual(entitlementSnapshot(before), entitlementSnapshot(fresh))) continue;
            if (trialStart && !expiredTrialStart(fresh)) continue;
            // Snapshot the ledger before destructive work. A concurrently funded
            // account fails this claim and is reconsidered on the next sweep.
            const claimed = await users.updateOne({ ...entitlementSnapshot(fresh),
                $or: [{ stripeBillingLease: { $exists: false } }, { 'stripeBillingLease.until': { $lte: new Date() } }],
                billingAccount: fresh.billingAccount ?? { $exists: false }, billingRecovery: fresh.billingRecovery }, { $set: { 'billingRecovery.purgingAt': new Date() } });
            if (!claimed.modifiedCount) continue;
            const pendingExportKeys = await revokeExportObjects(user.authSubject, db);
            const recordings = await db.collection<Recording>(Collections.RECORDINGS).find({ authSubject: user.authSubject }).toArray();
            const exports = await db.collection<ExportJob>(Collections.EXPORT_JOBS).find({ authSubject: user.authSubject }).toArray();
            const failures = await removeStoredObjects([...recordings.map(recording => recording.r2Key), ...exports.flatMap(job => job.parts.map(part => part.key)), ...pendingExportKeys], removeObject);
            if (failures.length) {
                result.failed++; continue;
            }
            await db.collection(Collections.RECORDINGS).deleteMany({ authSubject: user.authSubject });
            await db.collection(Collections.EXPORT_JOBS).deleteMany({ authSubject: user.authSubject });
            await db.collection('search_embedding_cache').deleteMany({ subject: user.authSubject });
            await db.collection('processing_execution_policies').deleteMany({ subject: user.authSubject });
            await db.collection('processing_provider_calls').deleteMany({ subject: user.authSubject });
            await db.collection(Collections.CONTACTS).updateMany({ authSubject: user.authSubject }, { $set: { totalRecordings: 0, lastRecordingAt: null } });
            await users.updateOne({ _id: user._id }, { $set: { storageUsed: 0, totalRecordings: 0, totalDuration: 0, 'billingRecovery.purgedAt': new Date() }, $unset: { uploadReservations: '', 'billingRecovery.purgingAt': '' } });
            result.purged++;
        } catch { result.failed++; }
    }
    return result;
}

import { createHash } from 'node:crypto';
import type { Db } from 'mongodb';
import type { User } from '@/lib/db/types';
import { resolveFundingSource } from '@/lib/stripe/funding-source';

export const INTERNAL_STORAGE_EXPENSES = 'billing_internal_storage_expenses';
export interface InternalStorageExpense {
    _id: string; subject: string; month: string; revision: number; retainedBytes: number; observedPeakBytes: number;
    observedAt: Date; firstObservedAt: Date; observationCount: number; costPolicyVersion?: string; estimateStale: boolean;
    estimatedPeakMonthCostMicros?: number; costBasis: 'estimated_peak_month' | 'unpriced';
    /** Actual storage invoices may reconcile separately; observations are not invoices. */
    actualCostMicros?: number; actualEvidenceId?: string;
}

/** Record physical storage observations without a wallet, cost table or spending cap.
 * Historical expense evidence is preserved; new observations estimate no dollars. */
export async function recordInternalStorageExpense(user: User, db: Db, at = new Date()): Promise<void> {
    if (resolveFundingSource(user, true) !== 'internal' || user.disabled || user.softDelete?.isDeleted) return;
    const bytes = user.storageUsed || 0;
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Internal retained-storage bytes need reconciliation.');
    const month = at.toISOString().slice(0, 7), id = createHash('sha256').update(`${user.authSubject}:${month}`).digest('hex');
    const rows = db.collection<InternalStorageExpense>(INTERNAL_STORAGE_EXPENSES);
    for (let attempt = 0; attempt < 32; attempt++) {
        const old = await rows.findOne({ _id: id });
        if (old && old.observedAt > at) return;
        const peak = Math.max(old?.observedPeakBytes || 0, bytes);
        const row: InternalStorageExpense = { _id: id, subject: user.authSubject, month, revision: (old?.revision || 0) + 1,
            retainedBytes: bytes, observedPeakBytes: peak, observedAt: at, firstObservedAt: old?.firstObservedAt || at,
            observationCount: (old?.observationCount || 0) + 1, estimateStale: true, costBasis: 'unpriced' };
        if (!old) {
            try { await rows.insertOne(row); return; }
            catch (error) { if ((error as { code?: number }).code === 11000) continue; throw error; }
        }
        const updated = await rows.updateOne({ _id: id, revision: old.revision }, { $set: row });
        if (updated.matchedCount) return;
    }
    throw new Error('Internal storage observation is busy. Retry shortly.');
}

// Accepted historical expense recovery only; Internal and trials have no dollar budgets.
import 'server-only';
import { BSON, type Db } from 'mongodb';
import { getMongoDb } from '@/lib/mongodb';
import { ledgerKey, money } from './ledger';
import type { ProcessingBudgetSnapshot } from './legacy-processing-budget';

export interface OperatorCost {
    id: string; subject: string; kind: string; parentId?: string; fundingKind?: 'trial' | 'grant' | 'internal'; maximumCostMicros: number;
    month: string; createdAt: Date; expiresAt: Date; state: 'reserved' | 'settled' | 'released';
    actualCostMicros?: number; finishedAt?: Date;
    evidenceId?: string;
    evidence?: { provider: string; model: string; source: string; providerReference?: string; measured?: boolean };
    outcome?: 'completed' | 'unknown'; costBasis?: 'committed_cap' | 'verified' | 'unpriced' | 'stale_estimate'; unpriced?: boolean;
    processingChildren?: Record<string, number>;
    processingBudget?: ProcessingBudgetSnapshot;
}
interface Pool {
    _id: string; revision: number;
    subjects: Record<string, { spentMicros: number; reservedMicros: number }>;
    months: Record<string, { spentMicros: number; reservedMicros: number }>;
    reservations: Record<string, OperatorCost>;
    review?: { id: string; reason: string; at: Date };
}
const COLLECTION = 'billing_operator_budget', RECEIPTS = 'billing_operator_cost_receipts', POOL_ID = 'managed-operator-costs-v1';
const INTERNAL_COLLECTION = 'billing_internal_costs', INTERNAL_RECEIPTS = 'billing_internal_cost_receipts';
const keyFor = (subject: string, id: string) => ledgerKey(`${subject}:${id}`);
const scopeFor = (subject: string, internal = false) => ({ collection: internal ? INTERNAL_COLLECTION : COLLECTION, receipts: internal ? INTERNAL_RECEIPTS : RECEIPTS, id: internal ? ledgerKey(subject) : POOL_ID });
async function locateCost(subject: string, id: string, db: Db) {
    for (const internal of [false, true]) {
        const scope = scopeFor(subject, internal), key = keyFor(subject, id);
        const pool = await db.collection<Pool>(scope.collection).findOne({ _id: scope.id });
        const row = pool?.reservations[key] || await db.collection<OperatorCost & { _id: string }>(scope.receipts).findOne({ _id: key, subject });
        if (row) return { row, internal };
    }
    return undefined;
}
export async function getOperatorCost(subject: string, id: string, database?: Db): Promise<OperatorCost | undefined> {
    return (await locateCost(subject, id, database || await getMongoDb()))?.row;
}

/** Settle or release accepted historical expenses in their original document.
 * No admission, spending cap or new expense reservation is available here. */
async function changePool<T>(subject: string, id: string, change: (pool: Pool, previous?: OperatorCost) => T, db: Db, internal = false): Promise<T> {
    const key = keyFor(subject, id);
    const scope = scopeFor(subject, internal);
    for (let attempt = 0; attempt < 32; attempt++) {
        const stored = await db.collection<Pool>(scope.collection).findOne({ _id: scope.id });
        if (!stored) throw new Error('The accepted legacy expense account is unavailable.');
        const pool = structuredClone(stored);
        // Archive before pruning and re-read on every CAS retry. A concurrent
        // compaction cannot make an old operation look like a new paid call.
        const archived = await db.collection<OperatorCost & { _id: string }>(scope.receipts).findOne({ _id: key });
        const previous = pool.reservations[key] || archived || undefined;
        // Only archive outcomes already committed in the stored revision. A
        // tentative settlement from this reducer must win its CAS first.
        const completed = Object.entries(pool.reservations).filter(([archiveKey, row]) => archiveKey !== key && ( row.state === 'released' || (row.state === 'settled' && (row.evidenceId || row.outcome === 'completed'))));
        const result = change(pool, previous);
        if (completed.length > 256) {
            for (const [archiveKey, row] of completed.slice(0, completed.length - 128)) {
                await db.collection<OperatorCost & { _id: string }>(scope.receipts).updateOne({ _id: archiveKey }, { $setOnInsert: { ...row, poolRevision: stored?.revision || 0 } }, { upsert: true });
                delete pool.reservations[archiveKey];
            }
        }
        if (BSON.calculateObjectSize(pool) > 8 * 1024 ** 2) throw new Error('The legacy expense journal needs archival maintenance before settlement can continue.');
        pool.revision++;
        // A previously archived receipt stays hot while its outcome/evidence is
        // corrected. Update its projection only after this CAS has won, and
        // fence the projection so a delayed writer cannot replace newer proof.
        const synchronizeArchive = async () => {
            if (!archived || !pool.reservations[key]) return;
            await db.collection<OperatorCost & { _id: string; poolRevision?: number }>(scope.receipts).updateOne({ _id: key, $or: [{ poolRevision: { $exists: false } }, { poolRevision: { $lt: pool.revision } }] },
                { $set: { ...pool.reservations[key], poolRevision: pool.revision } });
        };
        const updated = await db.collection<Pool>(scope.collection).replaceOne({ _id: scope.id, revision: stored.revision }, pool);
        if (updated.matchedCount) { await synchronizeArchive(); return result; }
    }
    throw new Error('The legacy expense journal is busy. Retry settlement.');
}

export async function settleOperatorCost(subject: string, id: string, input: { actualCostMicros: number; evidenceId?: string; evidence?: OperatorCost['evidence']; outcome?: OperatorCost['outcome']; costBasis?: OperatorCost['costBasis'] }, database?: Db): Promise<OperatorCost> {
    money(input.actualCostMicros);
    const db = database || await getMongoDb(), located = await locateCost(subject, id, db);
    return changePool(subject, id, (pool, previous) => {
        if (!previous || previous.subject !== subject) throw new Error('Operator cost reservation not found.');
        if (previous.state === 'settled') {
            if (previous.evidenceId && !input.evidenceId && input.actualCostMicros === previous.maximumCostMicros) return previous;
            if ((!input.evidenceId || previous.evidenceId) && !(input.outcome === 'completed' && previous.outcome !== 'completed' && !previous.evidenceId)) {
                if (previous.actualCostMicros !== input.actualCostMicros || (input.evidenceId && previous.evidenceId !== input.evidenceId)) throw new Error('Operator settlement conflict.');
                return previous;
            }
        }
        if (!['reserved', 'settled'].includes(previous.state)) throw new Error('Released operator work cannot incur another provider call.');
        const account = pool.subjects[ledgerKey(subject)], period = pool.months[previous.month];
        if (!account || !period) throw new Error('Operator cost provenance is missing.');
        if (previous.state === 'reserved') {
            account.reservedMicros -= previous.maximumCostMicros; period.reservedMicros -= previous.maximumCostMicros;
        }
        const delta = input.actualCostMicros - (previous.actualCostMicros || 0);
        account.spentMicros += delta; period.spentMicros += delta;
        if (input.actualCostMicros > previous.maximumCostMicros) pool.review = { id, reason: 'provider_cost_exceeded_operator_cap', at: new Date() };
        const row = { ...previous, ...input, ...(input.evidence?.source === 'stale_estimate' && !input.evidenceId ? { costBasis: 'stale_estimate' as const } : {}), ...(input.evidenceId ? { unpriced: false, costBasis: 'verified' as const } : {}), state: 'settled' as const, finishedAt: new Date() };
        pool.reservations[keyFor(subject, id)] = row; return row;
    }, db, located?.internal);
}

/** Only use when no external paid request started. Failures with unknown
 * provider outcomes settle at the full cap instead of releasing this hold. */
export async function releaseOperatorCost(subject: string, id: string, database?: Db): Promise<OperatorCost> {
    const db = database || await getMongoDb(), located = await locateCost(subject, id, db);
    return changePool(subject, id, (pool, previous) => {
        if (!previous || previous.subject !== subject) throw new Error('Operator cost reservation not found.');
        if (previous.state !== 'reserved') return previous;
        pool.subjects[ledgerKey(subject)].reservedMicros -= previous.maximumCostMicros;
        pool.months[previous.month].reservedMicros -= previous.maximumCostMicros;
        const row = { ...previous, state: 'released' as const, finishedAt: new Date() };
        pool.reservations[keyFor(subject, id)] = row; return row;
    }, db, located?.internal);
}

export async function hasUnsettledOperatorCosts(subject: string, database?: Db): Promise<boolean> {
    const db = database || await getMongoDb();
    for (const internal of [false, true]) {
        const scope = scopeFor(subject, internal), pool = await db.collection<Pool>(scope.collection).findOne({ _id: scope.id });
        if (Object.values(pool?.reservations || {}).some(row => row.subject === subject
            && (row.state === 'reserved' || (row.state === 'settled' && (row.unpriced || row.costBasis === 'stale_estimate' || !row.evidenceId && row.outcome !== 'completed'))))) return true;
        if (await db.collection(scope.receipts).findOne({ subject, state: 'settled', $or: [
            { unpriced: true }, { costBasis: 'stale_estimate' }, { evidenceId: null, outcome: { $ne: 'completed' } }, { evidenceId: { $exists: false }, outcome: { $ne: 'completed' } },
        ] })) return true;
    }
    return false;
}

/** Financial erasure calls this only after the 90-day settled retention window.
 * Historical monthly totals remain retained after subject evidence is removed. */
export async function forgetSettledOperatorSubject(subject: string, database?: Db): Promise<void> {
    const db = database || await getMongoDb();
    if (await hasUnsettledOperatorCosts(subject, db)) throw new Error('Unsettled operator costs must not be pruned.');
    for (const internal of [false, true]) {
        const scope = scopeFor(subject, internal);
        if (await db.collection<Pool>(scope.collection).findOne({ _id: scope.id })) await changePool(subject, 'financial-erasure', pool => {
            for (const row of Object.values(pool.reservations)) if (row.subject === subject
                && (row.state === 'reserved' || (row.state === 'settled' && (row.unpriced || row.costBasis === 'stale_estimate' || !row.evidenceId && row.outcome !== 'completed')))) throw new Error('Unsettled operator costs must not be pruned.');
            for (const [key, row] of Object.entries(pool.reservations)) if (row.subject === subject) delete pool.reservations[key];
            delete pool.subjects[ledgerKey(subject)];
        }, db, internal);
        await db.collection(scope.receipts).deleteMany({ subject });
    }
}

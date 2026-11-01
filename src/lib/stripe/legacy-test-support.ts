// Synthetic accepted-history fixtures for isolated unit/disposable database tests.
// Production code must never call these helpers to create monetary entitlements.
import type { Db } from 'mongodb';
import { MemoryBillingDatabase, clone, userFixture } from './test-support';
import { getBillingAccount, ledgerKey, mutateUsageBillingAccount, paymentFeeSchedule, reserveCost, type CostReservation, type ReserveCostInput, type UsageSettlement, type LegacyExpenseReservation } from './ledger';
import type { OperatorCost } from './legacy-operator-costs';
import { PROCESSING_BUDGETS, processingAiReservationId, type ProcessingBudgetSnapshot, type ProcessingChildReceipt } from './legacy-processing-budget';
import type { FundingSource } from './funding-source';
import { archiveManagedCostPolicy } from './cost-schedule';
import { getManagedCostPolicy } from './economics';

export function legacyMemoryDatabase() {
    const memory = new MemoryBillingDatabase();
    for (const name of ['billing_operator_budget', 'billing_internal_costs']) {
        const rows = memory.collection(name);
        Object.assign(rows, { replaceOne: async (filter: { _id: string; revision: number }, row: unknown) => {
            const index = rows.values.findIndex(value => value._id === filter._id && value.revision === filter.revision);
            if (index < 0) return { matchedCount: 0 };
            rows.values[index] = clone(row) as Record<string, unknown>; return { matchedCount: 1 };
        } });
    }
    return memory;
}

export function acceptedOperatorRow(subject: string, id: string, maximumCostMicros: number, extra: Partial<OperatorCost> = {}): OperatorCost {
    return { subject, id, kind: 'historical-provider-call', fundingKind: 'trial', maximumCostMicros, month: '2026-01',
        createdAt: new Date('2026-01-01'), expiresAt: new Date('2026-02-01'), state: 'reserved', ...extra };
}

export async function seedAcceptedOperatorRows(db: Db, rows: OperatorCost[], internal = false) {
    const subject = rows[0]?.subject;
    if (!subject) throw new Error('An isolated historical fixture requires at least one row.');
    const collection = db.collection(internal ? 'billing_internal_costs' : 'billing_operator_budget');
    const id = internal ? ledgerKey(subject) : 'managed-operator-costs-v1';
    const previous = await collection.findOne({ _id: id as never });
    const reservations: Record<string, OperatorCost> = { ...(previous?.reservations || {}) };
    for (const row of rows) reservations[ledgerKey(`${row.subject}:${row.id}`)] = row;
    const subjects: Record<string, { spentMicros: number; reservedMicros: number }> = {};
    const months: typeof subjects = {};
    for (const row of Object.values(reservations)) {
        const account = subjects[ledgerKey(row.subject)] ||= { spentMicros: 0, reservedMicros: 0 };
        const month = months[row.month] ||= { spentMicros: 0, reservedMicros: 0 };
        if (row.state === 'reserved') { account.reservedMicros += row.maximumCostMicros; month.reservedMicros += row.maximumCostMicros; }
        if (row.state === 'settled') { account.spentMicros += row.actualCostMicros || 0; month.spentMicros += row.actualCostMicros || 0; }
    }
    const fixture = { _id: id, revision: previous?.revision || 0, subjects, months, reservations };
    if (previous) await collection.replaceOne({ _id: id as never }, fixture as never);
    else await collection.insertOne(fixture as never);
}

export async function seedAcceptedProcessing(db: Db, subject = 'owner', id = 'accepted-audio', source: FundingSource = 'customer', children: Array<{ id: string; maximumCostMicros: number }> = []) {
    const model = { provider: 'gemini', model: 'accepted-historical-model' };
    const snapshot: ProcessingBudgetSnapshot = { version: 1, id, parentReceiptId: id, fundingSource: source,
        provider: 'soniox', model: 'accepted-historical-asr', costPolicyVersion: 'historical-policy',
        asrCostMicros: 100, aiCostMicros: 400, totalCostMicros: 500,
        aiModels: { summary: model, transliteration: model, embedding: model }, acceptedAt: '2026-01-01T00:00:00.000Z',
        transcriptEnvelope: { maxResponseBytes: 4096, maxSourceTextBytes: 1024, maxSegments: 64, maxWords: 256, maxSummaryLeaves: 2, maxReduceLevels: 2, maxTransliterationChunks: 4 } };
    const receipts: ProcessingChildReceipt[] = children.map(child => ({ ...child, version: 1, parentReceiptId: id, fundingSource: source }));
    const holder = processingAiReservationId(id), remaining = 400 - children.reduce((sum, child) => sum + child.maximumCostMicros, 0);
    if (remaining < 0) throw new Error('Invalid isolated historical allocation.');
    const user = userFixture({ authSubject: subject, planKey: source === 'internal' ? 'internal' : source === 'trial' ? 'free-trial' : source === 'grant' ? 'custom' : 'standard',
        stripeCustomerId: source === 'customer' ? 'cus_historical' : undefined,
        billingEntitlement: { source: source === 'customer' ? 'subscription' : source === 'trial' ? 'trial' : 'admin', grantedAt: new Date('2026-01-01') } });
    const amounts = [{ id: holder, maximumCostMicros: remaining }, ...children];
    if (source === 'customer') {
        const account = getBillingAccount(user), lot = ledgerKey('historical-base');
        account.recognizedRevenueMicros = 2000; account.recognizedCostMicros = 100; account.reservedCostMicros = 400;
        account.fundingLots[lot] = { id: 'historical-base', reference: 'isolated-paid-principal', source: 'test', kind: 'base', amountMicros: 2000,
            creditedMicros: 0, costMicros: 100, reservedCostMicros: 400, createdAt: new Date('2026-01-01') };
        for (const row of amounts) {
            const reservation: LegacyExpenseReservation = { ...row, kind: 'processing:ai', retailMicros: 0, state: 'reserved',
                allocations: { [lot]: row.maximumCostMicros }, expiresAt: new Date('2026-02-01'), createdAt: new Date('2026-01-01') };
            account.reservations[ledgerKey(row.id)] = reservation;
        }
        user.billingAccount = account;
    } else if (source !== 'selfhost') await seedAcceptedOperatorRows(db, [
        acceptedOperatorRow(subject, id, 100, { state: 'settled', actualCostMicros: 100, outcome: 'completed', fundingKind: source }),
        ...amounts.map(row => acceptedOperatorRow(subject, row.id, row.maximumCostMicros, { fundingKind: source })),
    ], source === 'internal');
    await db.collection('users').insertOne(user);
    const record = { _id: ledgerKey(`${subject}:${id}`), subject, snapshot, state: 'active',
        children: Object.fromEntries(receipts.map(receipt => [ledgerKey(receipt.id), { receipt, state: 'reserved' }])),
        createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') };
    await db.collection(PROCESSING_BUDGETS).insertOne(record as never);
    return { snapshot, receipts, holder, user, record };
}

/** Construct an accepted legacy expense fixture only; unavailable to application admission. */
export async function reserveLegacyCostFixture(subject: string, input: ReserveCostInput, db?: Db): Promise<CostReservation> {
    const schedule = await archiveManagedCostPolicy(getManagedCostPolicy(), db);
    const frozen = { ...input, paymentFeeSchedule: input.paymentFeeSchedule || paymentFeeSchedule(getManagedCostPolicy()), costPolicyVersion: schedule._id, costPolicyFingerprint: schedule.fingerprint };
    return mutateUsageBillingAccount(subject, async (account, user, database) => {
        const archived = await database.collection<{ _id: string; data: CostReservation }>('billing_financial_archive').findOne({ _id: ledgerKey(`${subject}:reservation:${input.id}`) });
        if (archived) return archived.data;
        if (input.parentId && !account.receipts[ledgerKey(input.parentId)]) {
            const parent = await database.collection<UsageSettlement & { _id: string }>('billing_usage_receipts').findOne({ _id: ledgerKey(input.parentId) });
            if (parent) account.receipts[ledgerKey(input.parentId)] = parent;
        }
        return reserveCost(account, user, frozen);
    }, db);
}

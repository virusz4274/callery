import { MongoServerError, type Db } from 'mongodb';
import { getMongoDb } from '@/lib/mongodb';
import { getHistoricalManagedCostPolicy, HistoricalCostScheduleError } from './cost-schedule';
import { settleOperatorCost } from './legacy-operator-costs';
import { env } from '@/lib/env';
import { getUsageFunding, earnedUsageFundingBalance, ledgerKey, money, mutateBillingAccount, retainedFundingCapacity, retainedLotCapacity, type BillingAccount, type CostReservation, type UsageSettlement } from './ledger';
import { hasBlockingFinancialReview } from './financial-review';

export interface ProviderCostEvidence {
    id: string; subject: string; receiptId: string; provider: string; model: string; costPolicyVersion: string;
    /** Actual provider charge plus the accepted, conservative infrastructure cap. Never customer retail. */
    costMicros: number; source: 'provider_usage_log' | 'provider_invoice' | 'measured_tokens';
    providerReference: string; observedAt: Date;
}
interface EvidenceRow extends ProviderCostEvidence { _id: string; appliedAt?: Date; lastCheckedAt?: Date; state?: 'pending' | 'review' | 'applied'; reviewReason?: string }
export class ProviderCostReviewError extends Error {}
export class ProviderCostPendingError extends Error {}
export function applyProviderCostEvidence(account: BillingAccount, evidence: ProviderCostEvidence): boolean {
    money(evidence.costMicros);
    const reservation = account.reservations[ledgerKey(evidence.receiptId)];
    if (!reservation || reservation.state !== 'settled') throw new ProviderCostPendingError('Provider cost has no completed financial reservation.');
    if (reservation.accountingMode === 'retail_only') throw new ProviderCostReviewError('Retail-only usage cannot accept historical provider-expense evidence.');
    if (reservation.costEvidenceId) {
        if (reservation.costEvidenceId !== evidence.id || reservation.actualCostMicros !== evidence.costMicros) throw new ProviderCostReviewError('Verified provider cost evidence conflicts.');
        return false;
    }
    const delta = evidence.costMicros - (reservation.actualCostMicros || 0);
    const tier = reservation.usageTier || 'recurring', cohort = getUsageFunding(account)[tier];
    const previousUsageCost = Math.min(cohort.costMicros, reservation.usageCostBudgetMicros || 0);
    const nextUsageCost = Math.min(evidence.costMicros + (reservation.processorFeeCostMicros || 0),
        Math.max(0, earnedUsageFundingBalance(account) + previousUsageCost));
    cohort.costMicros += nextUsageCost - previousUsageCost;
    reservation.usageCostBudgetMicros = nextUsageCost;
    account.recognizedCostMicros += delta;
    let desiredBaseCost = Math.max(0, evidence.costMicros + (reservation.processorFeeCostMicros || 0) - nextUsageCost);
    for (const [key, previous] of Object.entries(reservation.costAllocations || {})) {
        const lot = account.fundingLots[key]; if (!lot) throw new ProviderCostReviewError('Provider cost funding provenance is missing.');
        const next = Math.min(desiredBaseCost, previous);
        lot.costMicros += next - previous; reservation.costAllocations![key] = next; desiredBaseCost -= next;
    }
    for (const [key, lot] of Object.entries(account.fundingLots)) {
        if (!desiredBaseCost) break;
        if (lot.kind === 'prepaid') continue;
        const used = Math.min(desiredBaseCost, retainedLotCapacity(lot), retainedFundingCapacity(account));
        lot.costMicros += used; (reservation.costAllocations ||= {})[key] = (reservation.costAllocations?.[key] || 0) + used; desiredBaseCost -= used;
    }
    reservation.unfundedCostMicros = desiredBaseCost || undefined;
    if (desiredBaseCost && !account.costReview) account.costReview = { reason: 'verified_provider_cost_requires_operating_funding', evidenceId: evidence.id, at: new Date() };
    // An underestimated charge is incurred even when its original allocation cannot fund it.
    // Keep that debt visible and pause further admissions until an operator reviews the policy.
    if (evidence.costMicros > reservation.maximumCostMicros && !hasBlockingFinancialReview(account)) account.costReview = { reason: 'provider_cost_exceeded_accepted_cap', evidenceId: evidence.id, at: new Date() };
    const receipt = account.receipts[ledgerKey(evidence.receiptId)];
    if (receipt) receipt.committedCostMicros = (receipt.committedCostMicros || 0) + delta;
    reservation.actualCostMicros = evidence.costMicros; reservation.costBasis = evidence.source === 'measured_tokens' ? 'verified' : 'provider_verified'; reservation.costEvidenceId = evidence.id;
    return true;
}
export async function recordProviderCostEvidence(evidence: ProviderCostEvidence, database?: Db) {
    const db = database || await getMongoDb(), _id = ledgerKey(evidence.id);
    const records = db.collection<EvidenceRow>('billing_provider_cost_evidence');
    try { await records.insertOne({ ...evidence, _id }); }
    catch (error) {
        if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
        const old = await records.findOne({ _id });
        if (!old || old.receiptId !== evidence.receiptId || old.costMicros !== evidence.costMicros || old.providerReference !== evidence.providerReference || old.subject !== evidence.subject || old.provider !== evidence.provider || old.model !== evidence.model || old.costPolicyVersion !== evidence.costPolicyVersion) throw new ProviderCostReviewError('Provider evidence identifier was reused.');
    }
    const historical = await getHistoricalManagedCostPolicy(evidence.costPolicyVersion, db);
    const operatorAttempt = await db.collection<{ _id: string; receipt: { operatorReservationId?: string; maximumCostMicros: number; costPolicyVersion?: string; costPolicyFingerprint?: string } }>('billing_provider_attempts').findOne({ _id: ledgerKey(evidence.receiptId) });
    if (operatorAttempt?.receipt.operatorReservationId) {
        if (operatorAttempt.receipt.costPolicyVersion !== evidence.costPolicyVersion || operatorAttempt.receipt.costPolicyFingerprint !== historical.fingerprint) throw new ProviderCostReviewError('Operator provider evidence does not match its accepted historical cost schedule.');
        await settleOperatorCost(evidence.subject, operatorAttempt.receipt.operatorReservationId, { actualCostMicros: evidence.costMicros, evidenceId: evidence.id,
            evidence: { provider: evidence.provider, model: evidence.model, source: evidence.source, providerReference: evidence.providerReference, measured: true } }, db);
        if (evidence.costMicros > operatorAttempt.receipt.maximumCostMicros) await db.collection('billing_provider_circuits').updateOne({ provider: evidence.provider, model: evidence.model, costPolicyVersion: evidence.costPolicyVersion }, {
            $set: { state: 'open', reason: 'verified_cost_exceeded_accepted_cap', evidenceId: evidence.id, updatedAt: new Date() },
        }, { upsert: true });
        await records.updateOne({ _id }, { $set: { appliedAt: new Date(), lastCheckedAt: new Date(), state: 'applied' } });
        return;
    }
    const breached = await mutateBillingAccount(evidence.subject, async account => {
        const key = ledgerKey(evidence.receiptId);
        if (!account.reservations[key]) {
            const archived = await db.collection<{ _id: string; data: CostReservation }>('billing_financial_archive').findOne({ _id: ledgerKey(`${evidence.subject}:reservation:${evidence.receiptId}`) });
            if (archived) account.reservations[key] = archived.data;
        }
        if (account.reservations[key]?.costPolicyVersion !== evidence.costPolicyVersion || account.reservations[key]?.costPolicyFingerprint !== historical.fingerprint) throw new ProviderCostReviewError('Provider evidence does not match its accepted historical cost schedule.');
        if (!account.receipts[key]) {
            const parent = await db.collection<UsageSettlement & { _id: string }>('billing_usage_receipts').findOne({ _id: key });
            if (parent) account.receipts[key] = parent;
        }
        if (evidence.costMicros > account.reservations[key].maximumCostMicros) await db.collection('billing_provider_circuits').updateOne({ provider: evidence.provider, model: evidence.model, costPolicyVersion: evidence.costPolicyVersion }, {
            $set: { state: 'open', reason: 'verified_cost_exceeded_accepted_cap', evidenceId: evidence.id, updatedAt: new Date() },
        }, { upsert: true });
        applyProviderCostEvidence(account, evidence);
        return evidence.costMicros > account.reservations[key].maximumCostMicros;
    }, db);
    if (breached) await db.collection('billing_provider_circuits').updateOne({ provider: evidence.provider, model: evidence.model, costPolicyVersion: evidence.costPolicyVersion }, {
        $set: { state: 'open', reason: 'verified_cost_exceeded_accepted_cap', evidenceId: evidence.id, updatedAt: new Date() },
    }, { upsert: true });
    await records.updateOne({ _id }, { $set: { appliedAt: new Date(), lastCheckedAt: new Date(), state: 'applied' } });
}
export async function assertProviderCostCircuitClosed(provider: string, model: string, costPolicyVersion: string, database?: Db) {
    const db = database || await getMongoDb();
    if (await db.collection('billing_provider_circuits').findOne({ provider, model, costPolicyVersion, state: 'open' })) throw new Error('Provider spending is paused while its actual cost schedule is reviewed.');
}
/** Parse decimal USD without floating point rounding down an actual provider invoice. */
export function providerUsdToMicros(value: string): number {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(value); if (!match) throw new Error('Invalid provider USD cost.');
    const fraction = (match[2] || '').padEnd(6, '0');
    const result = Number(match[1]) * 1_000_000 + Number(fraction.slice(0, 6)) + (/[1-9]/.test(fraction.slice(6)) ? 1 : 0);
    return money(result);
}
function isCostReviewError(error: unknown): error is Error {
    return error instanceof HistoricalCostScheduleError || error instanceof ProviderCostReviewError
        || (error instanceof Error && /^(Billing account unavailable|Operator settlement conflict|Operator cost reservation not found|Operator cost provenance is missing|Released operator work cannot incur)/.test(error.message));
}
async function retainCostReview(evidence: ProviderCostEvidence, error: Error, db: Db) {
    const now = new Date();
    await db.collection<EvidenceRow>('billing_provider_cost_evidence').updateOne({ _id: ledgerKey(evidence.id) }, {
        $set: { lastCheckedAt: now, state: 'review', reviewReason: error.message },
    });
    // Historical expense uncertainty stays with its evidence journal. It cannot
    // create a new customer-payment restriction on otherwise valid retail work.
}
export async function reconcilePendingProviderCosts(database?: Db, limit = 50) {
    const db = database || await getMongoDb(); let applied = 0;
    for await (const evidence of db.collection<EvidenceRow>('billing_provider_cost_evidence').find({ appliedAt: { $exists: false } }).sort({ lastCheckedAt: 1, observedAt: 1 }).limit(limit)) {
        try { await recordProviderCostEvidence(evidence, db); applied++; }
        catch (error) {
            if (error instanceof ProviderCostPendingError) {
                await db.collection<EvidenceRow>('billing_provider_cost_evidence').updateOne({ _id: evidence._id }, { $set: { lastCheckedAt: new Date(), state: 'pending' } });
            } else if (isCostReviewError(error)) await retainCostReview(evidence, error, db);
            else throw error;
        }
    }
    return applied;
}
/** New execution-policy jobs never enter the historical expense engine. Keep
 * actual unresolved journals, including malformed old evidence, recoverable. */
export async function hasLegacyProviderCostWork(db: Db, provider?: string): Promise<boolean> {
    const evidence = db.collection<EvidenceRow>('billing_provider_cost_evidence');
    if (await evidence.findOne({ ...(provider ? { provider } : {}), appliedAt: { $exists: false } })) return true;
    const attempts = db.collection<{ _id: string; receipt: { id: string } }>('billing_provider_attempts').find({
        ...(provider ? { provider } : {}), 'receipt.costPolicyVersion': { $type: 'string' },
        'receipt.executionPolicy': { $exists: false }, 'receipt.accountingMode': { $ne: 'retail_only' },
    });
    for await (const attempt of attempts) {
        if (!await evidence.findOne({ receiptId: attempt.receipt.id, appliedAt: { $exists: true } })) return true;
    }
    return false;
}
/** Read-only provider reconciliation. A fixed window and cursor are durable; errors never advance it. */
export async function reconcileSonioxCosts(database?: Db, fetcher: typeof fetch = fetch, maxPages = 2) {
    if (!env.SONIOX_API_KEY) return { verified: 0, pending: 0 };
    const db = database || await getMongoDb();
    if (!await hasLegacyProviderCostWork(db, 'soniox')) return { verified: 0, pending: 0 };
    const jobs = db.collection<{ _id: string; start: Date; end: Date; cursor?: string; done?: boolean }>('billing_provider_cost_scans');
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const _id = `soniox:${today.toISOString()}`;
    let scan = (await jobs.find({ done: { $ne: true } }).sort({ start: 1 }).limit(1).toArray())[0] || await jobs.findOne({ _id });
    if (!scan) {
        scan = { _id, start: new Date(today.getTime() - 2 * 86400_000), end: new Date() };
        try { await jobs.insertOne(scan); } catch (error) { if (!(error instanceof MongoServerError && error.code === 11000)) throw error; scan = (await jobs.findOne({ _id }))!; }
    }
    let verified = 0, pending = 0;
    if (scan.done) return { verified, pending };
    for (let page = 0; page < maxPages; page++) {
        const url = new URL(`${env.SONIOX_API_BASE_URL}/v1/usage-logs`);
        url.searchParams.set('start_time', scan.start.toISOString()); url.searchParams.set('end_time', scan.end.toISOString());
        url.searchParams.set('limit', '1000'); url.searchParams.set('sort', 'end_time_asc'); if (scan.cursor) url.searchParams.set('cursor', scan.cursor);
        const response = await fetcher(url, { headers: { Authorization: `Bearer ${env.SONIOX_API_KEY}` }, signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error(`Soniox cost verification failed (${response.status}).`);
        const body = await response.json() as { usage_logs: { uuid: string; client_reference_id?: string; model: string; cost_usd: string }[]; next_page_cursor?: string | null };
        if (!Array.isArray(body.usage_logs)) throw new Error('Invalid Soniox usage log response.');
        for (const log of body.usage_logs) {
            if (!log.client_reference_id?.startsWith('transcription-v2:')) continue;
            const attempt = await db.collection<{ _id: string; authSubject: string; receipt: { id: string; model: string; costPolicyVersion?: string; accountingMode?: string; executionPolicy?: unknown; infrastructureCostMicros?: number; overheadCostMicros?: number } }>('billing_provider_attempts').findOne({ _id: ledgerKey(log.client_reference_id) });
            // Shared provider logs also contain new retail-only recordings.
            // Those are operational observations, not missing expense evidence.
            if (!attempt?.receipt.costPolicyVersion || attempt.receipt.executionPolicy || attempt.receipt.accountingMode === 'retail_only') continue;
            if (attempt.receipt.model !== log.model) { pending++; continue; }
            const evidence: ProviderCostEvidence = { id: `soniox:${log.uuid}`, subject: attempt.authSubject, receiptId: attempt.receipt.id, provider: 'soniox', model: log.model,
                    costPolicyVersion: attempt.receipt.costPolicyVersion, costMicros: providerUsdToMicros(log.cost_usd) + (attempt.receipt.infrastructureCostMicros || 0) + (attempt.receipt.overheadCostMicros || 0),
                    source: 'provider_usage_log', providerReference: log.uuid, observedAt: new Date() };
            try {
                await recordProviderCostEvidence(evidence, db); verified++;
            } catch (error) {
                if (error instanceof ProviderCostPendingError) { pending++; continue; }
                if (isCostReviewError(error)) { await retainCostReview(evidence, error, db); pending++; continue; }
                throw error;
            }
        }
        // Pending jobs can complete on a subsequent daily overlapping scan; evidence rows remain durable meanwhile.
        scan.cursor = body.next_page_cursor || undefined;
        await jobs.updateOne({ _id: scan._id }, { $set: { cursor: scan.cursor, done: !scan.cursor } });
        if (!scan.cursor) break;
    }
    return { verified, pending };
}

/** Unknown provider outcomes outlive the meter invoice; known successful work
 * may settle conservatively without claiming that its cap was measured. */
export async function hasUnsettledProviderCosts(subject: string, database?: Db): Promise<boolean> {
    const db = database || await getMongoDb();
    const account = await db.collection<{ authSubject: string; billingAccount?: BillingAccount }>('users').findOne({ authSubject: subject })
        || await db.collection<{ authSubject: string; billingAccount?: BillingAccount }>('billing_deleted_accounts').findOne({ authSubject: subject });
    const providerKind = (kind: string) => kind === 'transcription' || kind.startsWith('ai:') || kind === 'search:embedding';
    if (Object.values(account?.billingAccount?.reservations || {}).some(row => providerKind(row.kind) && row.state !== 'released' && row.maximumCostMicros > 0
        && (row.state === 'reserved' || !['verified', 'provider_verified'].includes(row.costBasis || '')
            && !(row.state === 'settled' && row.outcome === 'completed' && row.costBasis === 'committed_cap')))) return true;
    if (await db.collection('billing_provider_cost_evidence').findOne({ subject, appliedAt: { $exists: false } })) return true;
    return Boolean(await db.collection('billing_financial_archive').findOne({ authSubject: subject, kind: 'reservation', 'data.maximumCostMicros': { $gt: 0 },
        'data.state': { $ne: 'released' }, 'data.costBasis': { $nin: ['verified', 'provider_verified'] },
        $and: [{ $or: [{ 'data.outcome': { $ne: 'completed' } }, { 'data.costBasis': { $ne: 'committed_cap' } }] }],
        $or: [{ 'data.kind': 'transcription' }, { 'data.kind': { $regex: '^ai:' } }, { 'data.kind': 'search:embedding' }] }));
}

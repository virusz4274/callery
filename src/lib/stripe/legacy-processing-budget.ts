// Accepted historical expense recovery only. New processing uses execution-policy.ts.
import type { Db } from 'mongodb';
import type { AiStep } from '@/services/ai/types';
import type { AiCostRate } from './economics';
import type { ProcessingAiModel as ExecutionAiModel, ProcessingTranscriptEnvelope as ExecutionTranscriptEnvelope } from '@/lib/transcription/processing-policy';
import type { FundingSource } from './funding-source';
import { isDeepStrictEqual } from 'node:util';
import { getMongoDb } from '@/lib/mongodb';
import { ledgerKey, money, mutateBillingAccount, releaseReservation, settleReservation } from './ledger';
import { releaseOperatorCost, settleOperatorCost } from './legacy-operator-costs';
import { recordProviderCostEvidence } from './provider-costs';

/** Historical expense evidence. New execution uses processing-policy.ts. */
export interface ProcessingTranscriptEnvelope extends ExecutionTranscriptEnvelope {
    externalAsrCostBoundMicros?: number;
    externalBoundProof?: { kind: 'provider_enforced' | 'provider_contract'; reference: string; expiresAt: string; verifiedAt: string; verifiedBy: string; enforcedConfiguration?: { provider: string; model: string; maxAsrOutputTokens?: number } };
}
export interface ProcessingAiModel extends ExecutionAiModel {
    rate?: AiCostRate; stale?: boolean; unpriced?: boolean;
}
export interface ProcessingBudgetSnapshot {
    version: 1; id: string; parentReceiptId: string; fundingSource: FundingSource;
    provider: string; model: string; costPolicyVersion?: string; costPolicyFingerprint?: string;
    asrCostMicros: number; aiCostMicros: number; totalCostMicros: number;
    aiModels: Record<AiStep, ProcessingAiModel>; transcriptEnvelope: ProcessingTranscriptEnvelope;
    acceptedAt: string; unpriced?: boolean; transcriptRevision?: string; recordingId?: string;
    audioDurationSeconds?: number; fileSize?: number;
}
export interface ProcessingChildReceipt {
    version: 1; id: string; parentReceiptId: string; fundingSource: FundingSource; maximumCostMicros: number; unpriced?: boolean;
}
export interface ProcessingChildSettlement {
    actualCostMicros?: number; outcome: 'completed' | 'unknown'; evidenceId?: string;
    evidence?: { provider: string; model: string; source: string; providerReference?: string; measured?: boolean };
}

interface BudgetRecord {
    _id: string; subject: string; snapshot: ProcessingBudgetSnapshot; state: 'prepared' | 'active' | 'closing' | 'closed';
    children: Record<string, { receipt: ProcessingChildReceipt; state: 'reserved' | 'completed' | 'unknown' | 'released' }>;
    createdAt: Date; updatedAt: Date;
}
export const PROCESSING_BUDGETS = 'billing_processing_budgets';
export const processingAiReservationId = (parentReceiptId: string) => `processing-ai:${parentReceiptId}`;
const budgetKey = (subject: string, id: string) => ledgerKey(`${subject}:${id}`);
async function childBudget(subject: string, receipt: ProcessingChildReceipt, db: Db) {
    const record = await db.collection<BudgetRecord>(PROCESSING_BUDGETS).findOne({ _id: budgetKey(subject, receipt.parentReceiptId), subject });
    if (!record || !isDeepStrictEqual(record.children[ledgerKey(receipt.id)]?.receipt, receipt)) throw new Error('The accepted processing child is unavailable.');
    return record;
}
export async function settleProcessingChild(subject: string, receipt: ProcessingChildReceipt, input: ProcessingChildSettlement, database?: Db) {
    const db = database || await getMongoDb(), record = await childBudget(subject, receipt, db);
    const actual = input.actualCostMicros ?? receipt.maximumCostMicros; money(actual);
    const exceeds = actual > receipt.maximumCostMicros && !receipt.unpriced;
    if (receipt.fundingSource === 'customer') await mutateBillingAccount(subject, account => settleReservation(account, receipt.id, {
        actualCostMicros: Math.min(actual, receipt.maximumCostMicros), chargedMicros: 0, outcome: exceeds ? 'unknown' : input.outcome, costBasis: 'committed_cap',
    }), db);
    else if (receipt.fundingSource !== 'selfhost') await settleOperatorCost(subject, receipt.id, {
        actualCostMicros: actual, outcome: input.outcome, costBasis: receipt.unpriced && !input.evidenceId ? 'unpriced' : input.evidenceId ? 'verified' : input.evidence?.source === 'stale_estimate' ? 'stale_estimate' : 'committed_cap',
        evidenceId: input.evidenceId, evidence: input.evidence,
    }, db);
    if (receipt.fundingSource === 'customer' && input.evidenceId && input.evidence?.measured) {
        if (!record.snapshot.costPolicyVersion || !['measured_tokens', 'provider_invoice', 'provider_usage_log'].includes(input.evidence.source)) throw new Error('The actual processing cost needs its accepted schedule and evidence source.');
        await recordProviderCostEvidence({ id: input.evidenceId, subject, receiptId: receipt.id, provider: input.evidence.provider, model: input.evidence.model,
            costPolicyVersion: record.snapshot.costPolicyVersion, costMicros: actual, source: input.evidence.source as 'measured_tokens' | 'provider_invoice' | 'provider_usage_log',
            providerReference: input.evidence.providerReference || receipt.id, observedAt: new Date() }, db);
    }
    if (exceeds) {
        if (input.evidence) await db.collection('billing_provider_circuits').updateOne({ provider: input.evidence.provider, model: input.evidence.model,
            costPolicyVersion: record.snapshot.costPolicyVersion || 'internal-unpriced' }, { $set: { state: 'open', reason: 'verified_cost_exceeded_accepted_cap', evidenceId: input.evidenceId || receipt.id, updatedAt: new Date() } }, { upsert: true });
        if (receipt.fundingSource === 'customer' && !input.evidenceId) await mutateBillingAccount(subject, account => { account.costReview = { reason: 'processing_cost_exceeded_accepted_cap', evidenceId: receipt.id, at: new Date() }; }, db);
    }
    await db.collection<BudgetRecord>(PROCESSING_BUDGETS).updateOne({ _id: record._id, subject }, { $set: {
        [`children.${ledgerKey(receipt.id)}.state`]: exceeds ? 'unknown' : input.outcome,
        [`children.${ledgerKey(receipt.id)}.observedCostMicros`]: actual, updatedAt: new Date(),
    } });
    if (exceeds) throw new Error('Actual processing cost exceeded its accepted bound. Its expense is retained for review.');
}
export async function releaseProcessingChild(subject: string, receipt: ProcessingChildReceipt, database?: Db) {
    const db = database || await getMongoDb(), record = await childBudget(subject, receipt, db);
    if (receipt.fundingSource === 'customer') await mutateBillingAccount(subject, account => {
        const row = account.reservations[ledgerKey(receipt.id)];
        if (row && row.state === 'settled') throw new Error('A provider outcome cannot be released as an unstarted call.');
        return releaseReservation(account, receipt.id);
    }, db);
    else if (receipt.fundingSource !== 'selfhost') {
        const row = await releaseOperatorCost(subject, receipt.id, db);
        if (row.state === 'settled') throw new Error('A provider outcome cannot be released as an unstarted call.');
    }
    await db.collection<BudgetRecord>(PROCESSING_BUDGETS).updateOne({ _id: record._id, subject }, { $set: { [`children.${ledgerKey(receipt.id)}.state`]: 'released', updatedAt: new Date() } });
}
export async function closeProcessingBudget(subject: string, parentReceiptId: string, database?: Db) {
    const db = database || await getMongoDb(), record = await db.collection<BudgetRecord>(PROCESSING_BUDGETS).findOne({ _id: budgetKey(subject, parentReceiptId), subject });
    if (!record || record.state === 'closed') return;
    if (Object.values(record.children).some(child => child.state === 'reserved' || child.state === 'unknown')) throw new Error('Unresolved processing calls must settle before closing their budget.');
    if (record.state === 'active') {
        const claimed = await db.collection<BudgetRecord>(PROCESSING_BUDGETS).updateOne({ _id: record._id, subject, state: 'active', children: record.children }, { $set: { state: 'closing', updatedAt: new Date() } });
        if (!claimed.matchedCount) throw new Error('Processing calls changed before their budget could close. Retry.');
    } else if (record.state !== 'closing') throw new Error('The processing budget was never accepted.');
    const holderId = processingAiReservationId(parentReceiptId), source = record.snapshot.fundingSource;
    if (source === 'customer') await mutateBillingAccount(subject, account => releaseReservation(account, holderId), db);
    else if (source !== 'selfhost') await releaseOperatorCost(subject, holderId, db);
    await db.collection<BudgetRecord>(PROCESSING_BUDGETS).updateOne({ _id: record._id, subject, state: 'closing' }, { $set: { state: 'closed', updatedAt: new Date() } });
}

/** Compatibility only: release legacy AI holds proven unused by durable recording
 * checkpoints. Unknown outcomes remain financial evidence; new calls never use
 * this allocator. A saved result can finish its original settlement idempotently. */
export async function retireLegacyProcessingBudget(subject: string, parentId: string, checkpoints: Record<string, {
    reservationId: string; state: string; result?: unknown; actualCostMicros?: number;
}>, database?: Db): Promise<boolean> {
    const db = database || await getMongoDb();
    const record = await db.collection<BudgetRecord>(PROCESSING_BUDGETS).findOne({ _id: budgetKey(subject, parentId), subject });
    if (!record || record.state === 'closed') return true;
    for (const child of Object.values(record.children)) {
        if (child.state === 'completed' || child.state === 'released') continue;
        const checkpoint = Object.values(checkpoints).find(row => row.reservationId === child.receipt.id);
        if (!checkpoint) return false;
        if (checkpoint.state === 'prepared' && child.state === 'reserved') await releaseProcessingChild(subject, child.receipt, db);
        else if (['response_saved', 'completed'].includes(checkpoint.state) && checkpoint.result !== undefined) {
            try { await settleProcessingChild(subject, child.receipt, { actualCostMicros: checkpoint.actualCostMicros, outcome: 'completed' }, db); }
            catch { return false; } // Preserve unresolved historical evidence, never re-run the provider.
        } else return false;
    }
    try { await closeProcessingBudget(subject, parentId, db); return true; }
    catch { return false; }
}

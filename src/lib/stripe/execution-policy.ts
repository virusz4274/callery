import type { Db } from 'mongodb';
import { isDeepStrictEqual } from 'node:util';
import type { User } from '@/lib/db/types';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { ledgerKey } from './ledger';
import type { FundingSource } from './funding-source';
import type { AiPlannerVersion, ProcessingAiModel, ProcessingTranscriptEnvelope } from '@/lib/transcription/processing-policy';
import type { AiStep } from '@/services/ai/types';
import { hasBlockingFinancialReview, hasBlockingBillingReview } from './financial-review';
import { assertProcessingAvailable } from '@/lib/processing-availability';

/** Immutable request limits, deliberately independent of prices and expense funding. */
export interface ExecutionPolicySnapshot {
    version: 1; id: string; parentReceiptId: string; fundingSource: FundingSource;
    provider: string; model: string; aiModels: Record<AiStep, ProcessingAiModel>;
    transcriptEnvelope: ProcessingTranscriptEnvelope; promptVersion: string; maximumAttempts: 2;
    /** Absent on accepted legacy policies, which must retain planner v1. */
    plannerVersion?: AiPlannerVersion;
    acceptedAt: string; transcriptRevision?: string; recordingId?: string;
    audioDurationSeconds?: number; fileSize?: number;
}
interface ExecutionRecord {
    _id: string; subject: string; snapshot: ExecutionPolicySnapshot; state: 'active' | 'closed';
    calls: Record<string, { id: string; requestHash: string; acceptedAt?: Date; state: 'accepted' | 'completed' | 'unknown'; observedAt?: Date }>;
    createdAt: Date; updatedAt: Date;
}
export const EXECUTION_POLICIES = 'processing_execution_policies';
const key = (subject: string, id: string) => ledgerKey(`${subject}:${id}`);
function canonical<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
export async function prepareExecutionPolicy(subject: string, snapshot: ExecutionPolicySnapshot, database?: Db): Promise<ExecutionPolicySnapshot> {
    if (snapshot.id !== snapshot.parentReceiptId || snapshot.maximumAttempts !== 2 || !Number.isFinite(Date.parse(snapshot.acceptedAt))
        || snapshot.plannerVersion !== undefined && snapshot.plannerVersion !== 1 && snapshot.plannerVersion !== 2) throw new Error('Invalid immutable execution policy.');
    const db = database || await getMongoDb(), rows = db.collection<ExecutionRecord>(EXECUTION_POLICIES);
    snapshot = canonical(snapshot);
    await rows.updateOne({ _id: key(subject, snapshot.id) }, { $setOnInsert: { subject, snapshot, state: 'active', calls: {}, createdAt: new Date(), updatedAt: new Date() } }, { upsert: true });
    const saved = await rows.findOne({ _id: key(subject, snapshot.id), subject });
    const identity = (value: ExecutionPolicySnapshot) => ({ ...canonical(value), acceptedAt: undefined });
    if (!saved || !isDeepStrictEqual(identity(saved.snapshot), identity(snapshot))) throw new Error('The accepted execution policy changed. Resume its original request.');
    return saved.snapshot;
}
export async function getExecutionPolicy(subject: string, id: string, database?: Db): Promise<ExecutionPolicySnapshot | undefined> {
    return (await (database || await getMongoDb()).collection<ExecutionRecord>(EXECUTION_POLICIES).findOne({ _id: key(subject, id), subject }))?.snapshot;
}
export async function acceptExecutionCall(subject: string, parentId: string, id: string, requestHash: string, database?: Db) {
    const db = database || await getMongoDb();
    await assertProcessingAvailable(db);
    const user = await db.collection<User>(Collections.USERS).findOne({ authSubject: subject });
    if (!user || user.disabled || user.softDelete?.isDeleted || hasBlockingBillingReview(user.billingReview) || hasBlockingFinancialReview(user.billingAccount) || user.billingRecovery?.purgingAt) throw new Error('The account cannot start another processing call.');
    const rows = db.collection<ExecutionRecord>(EXECUTION_POLICIES), record = await rows.findOne({ _id: key(subject, parentId), subject, state: 'active' });
    if (!record) throw new Error('The accepted execution policy is unavailable.');
    const callKey = ledgerKey(id), prior = record.calls[callKey];
    if (prior) {
        if (prior.requestHash !== requestHash || prior.state !== 'accepted') throw new Error('The provider call was already completed or requires outcome review.');
        return;
    }
    const saved = await rows.updateOne({ _id: record._id, subject, state: 'active', [`calls.${callKey}`]: { $exists: false } }, {
        $set: { [`calls.${callKey}`]: { id, requestHash, state: 'accepted', acceptedAt: new Date() }, updatedAt: new Date() },
    });
    if (!saved.matchedCount) throw new Error('The processing call changed concurrently. Resume its checkpoint.');
}
export async function recordExecutionOutcome(subject: string, parentId: string, id: string, outcome: 'completed' | 'unknown', database?: Db) {
    const db = database || await getMongoDb(), callKey = ledgerKey(id);
    const saved = await db.collection<ExecutionRecord>(EXECUTION_POLICIES).updateOne({ _id: key(subject, parentId), subject, state: { $in: ['active', 'closed'] } }, {
        $set: { [`calls.${callKey}.id`]: id, [`calls.${callKey}.state`]: outcome, [`calls.${callKey}.observedAt`]: new Date(), updatedAt: new Date() },
    });
    if (!saved.matchedCount) throw new Error('The provider call checkpoint is unavailable.');
}
export async function closeExecutionPolicy(subject: string, id: string, database?: Db) {
    const db = database || await getMongoDb(), rows = db.collection<ExecutionRecord>(EXECUTION_POLICIES);
    const record = await rows.findOne({ _id: key(subject, id), subject });
    if (!record || record.state === 'closed') return;
    if (Object.values(record.calls).some(call => call.state !== 'completed')) throw new Error('Uncertain provider calls require review before closing processing.');
    const result = await rows.updateOne({ _id: record._id, subject, state: 'active', calls: record.calls }, { $set: { state: 'closed', updatedAt: new Date() } });
    if (!result.matchedCount) throw new Error('Provider calls changed before processing closed.');
}

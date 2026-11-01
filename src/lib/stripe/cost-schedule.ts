import { createHash } from 'node:crypto';
import { MongoServerError, type Db } from 'mongodb';
import { getMongoDb } from '@/lib/mongodb';
import type { ManagedCostPolicy } from './economics';

export class HistoricalCostScheduleError extends Error {}
export interface ArchivedCostSchedule {
    _id: string; fingerprint: string; policy: ManagedCostPolicy; archivedAt: Date;
}
function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
    return value;
}
/** Cost schedules contain prices and limits only. Provider credentials are never accepted here. */
export function managedCostPolicyFingerprint(policy: ManagedCostPolicy): string {
    return createHash('sha256').update(JSON.stringify(canonical(policy))).digest('hex');
}
/** The version is an immutable identity, not a label that can silently reprice accepted work. */
export async function archiveManagedCostPolicy(policy: ManagedCostPolicy, database?: Db): Promise<ArchivedCostSchedule> {
    if (!policy.version) throw new Error('A versioned managed cost schedule is required.');
    const db = database || await getMongoDb(), records = db.collection<ArchivedCostSchedule>('billing_cost_schedules');
    const row: ArchivedCostSchedule = { _id: policy.version, fingerprint: managedCostPolicyFingerprint(policy), policy: structuredClone(policy), archivedAt: new Date() };
    try { await records.insertOne(row); return row; }
    catch (error) { if (!(error instanceof MongoServerError && error.code === 11000)) throw error; }
    const existing = await records.findOne({ _id: policy.version });
    if (!existing || existing.fingerprint !== row.fingerprint || managedCostPolicyFingerprint(existing.policy) !== row.fingerprint) {
        throw new Error('This cost version already has a different immutable schedule. Publish a new reviewed version before spending.');
    }
    return existing;
}
/** Historical reconciliation must never fall back to today's environment rates. Expiry does not erase history. */
export async function getHistoricalManagedCostPolicy(version: string, database?: Db): Promise<ArchivedCostSchedule> {
    const db = database || await getMongoDb();
    const record = await db.collection<ArchivedCostSchedule>('billing_cost_schedules').findOne({ _id: version });
    if (!record || record.fingerprint !== managedCostPolicyFingerprint(record.policy)) throw new HistoricalCostScheduleError('The accepted historical cost schedule is unavailable. Retain the financial receipt for review.');
    return record;
}

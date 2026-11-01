import { createHash, randomUUID } from 'node:crypto';
import { billingEnabled } from '@/lib/config';
import { findUserByAuthSubject } from '@/lib/db/users';
import type { User } from '@/lib/db/types';
import { enqueueUsageEvent, flushUsageEvents, type UsageEvent } from './usage-queue';
import { hasVerifiedMetering } from './billing-types';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { ensureBillingPeriod, getBillingAccount, type LedgerUser } from './ledger';
import type { Db } from 'mongodb';

export interface TranscriptionBillingContext {
    authSubject: string;
    customerId: string;
    subscriptionId: string;
    source: 'subscription' | 'lifetime';
    acceptedAt: Date;
}
export interface UsageOptions {
    multiplier?: number;
    identifier?: string;
    acceptedBilling?: TranscriptionBillingContext | null;
}

/** Capture at actual provider submission, after access checks; overage controls admission, not accounting. */
export function captureTranscriptionBilling(user: User, acceptedAt = new Date()): TranscriptionBillingContext | undefined {
    const source = user.billingEntitlement?.source;
    if (!user.stripeCustomerId || !user.stripeSubscriptionId || !hasVerifiedMetering(user) || (source !== 'subscription' && source !== 'lifetime')) return;
    return { authSubject: user.authSubject, customerId: user.stripeCustomerId, subscriptionId: user.stripeSubscriptionId, source, acceptedAt };
}

export function meterQuantity(quantity: number, multiplier = 1): number {
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(multiplier) || multiplier <= 0) return 0;
    return Math.ceil(quantity * multiplier);
}

type UsageInput = Pick<UsageEvent, '_id' | 'authSubject' | 'customerId' | 'type' | 'value' | 'timestamp'>;
/** Stable receipt IDs and accepted timestamps preserve usage across payment failure and period rollover. */
export function buildUsageEvent(subject: string, type: 'storage' | 'transcription', quantity: number, user: User | null, options?: UsageOptions): UsageInput | undefined {
    if (!meterQuantity(quantity, options?.multiplier)) return;
    if (type === 'transcription' && options?.acceptedBilling === null) return;
    let context = type === 'transcription' ? options?.acceptedBilling : undefined;
    if (context && (context.authSubject !== subject || !options?.identifier || !context.customerId || !context.subscriptionId
        || !['subscription', 'lifetime'].includes(context.source) || !Number.isFinite(new Date(context.acceptedAt).getTime()))) return;
    if (!context && type === 'transcription' && options?.identifier && user?.stripeCustomerId && user.stripeSubscriptionId
        && ['subscription', 'lifetime'].includes(user.billingEntitlement?.source || '')) {
        // Historical in-flight recordings predate the snapshot field. Retain their accepted work even after collection fails.
        context = { authSubject: subject, customerId: user.stripeCustomerId, subscriptionId: user.stripeSubscriptionId,
            source: user.billingEntitlement!.source as 'subscription' | 'lifetime', acceptedAt: new Date() };
    }
    if (!context && (!user?.stripeCustomerId || user.disabled || user.softDelete?.isDeleted || !hasVerifiedMetering(user))) return;
    const customerId = context?.customerId || user!.stripeCustomerId!;
    const period = user?.storagePeakPeriodEnd?.toISOString() || 'unbounded';
    const sourceId = type === 'storage'
        ? `storage:${subject}:${user!.stripeSubscriptionId}:${period}`
        : options?.identifier || `transcription:${subject}:${randomUUID()}`;
    const id = createHash('sha256').update(sourceId).digest('hex');
    const value = type === 'storage' ? meterQuantity(Math.max(quantity, user!.storagePeakUsed)) : meterQuantity(quantity, options?.multiplier);
    return { _id: id, authSubject: subject, customerId, type, value,
        timestamp: Math.floor(new Date(context?.acceptedAt || Date.now()).getTime() / 1000) };
}

/** Persist first, then send. Transcription receipts remain billable after failed collection or changed admission settings. */
export async function reportUsage(subject: string, type: 'storage' | 'transcription', quantity: number, options?: UsageOptions) {
    if (!billingEnabled() || !meterQuantity(quantity, options?.multiplier)) return;
    const user = await findUserByAuthSubject(subject);
    if (type === 'storage') {
        if (!user || !hasVerifiedMetering(user)) return;
        await ensureBillingPeriod(subject);
        await drainLedgerOutbox(subject);
        await flushUsageEvents(10);
        return;
    }
    // New submissions settle their immutable receipt through settleCanonicalTranscription.
    // Legacy receipts retain their original v1 identity and are held for migration review.
    const event = buildUsageEvent(subject, type, quantity, user, options);
    if (!event) return;
    await enqueueUsageEvent({ ...event, catalogVersion: 'legacy', state: 'needs_review', reviewReason: 'legacy_usage_requires_reconciliation' });
}

/** Copy committed user outboxes before clearing by revision. A crash at either boundary is harmless. */
export async function drainLedgerOutbox(subject?: string, database?: Db): Promise<number> {
    const db = database || await getMongoDb(); let count = 0;
    for (const collection of [Collections.USERS, 'billing_deleted_accounts']) {
        const users = db.collection<LedgerUser>(collection);
        for await (const user of users.find({ ...(subject ? { authSubject: subject } : {}), 'billingAccount.version': 2 })) {
            for (const [key, event] of Object.entries(getBillingAccount(user).outbox)) {
                await enqueueUsageEvent({ _id: event.id, authSubject: event.subject, customerId: event.customerId, type: event.type, value: event.value,
                    timestamp: event.timestamp, catalogVersion: event.tariffVersion, meterPriceId: event.meterPriceId,
                    usageTier: event.usageTier, eventName: event.eventName, tariff: event.tariff,
                    periodStart: event.periodStart, periodEnd: event.periodEnd }, db);
                await users.updateOne({ _id: user._id, [`billingAccount.outbox.${key}.revision`]: event.revision }, { $unset: { [`billingAccount.outbox.${key}`]: '' }, $inc: { 'billingAccount.revision': 1 } });
                count++;
            }
        }
    }
    return count;
}

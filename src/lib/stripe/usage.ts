import { createHash, randomUUID } from 'node:crypto';
import { billingEnabled } from '@/lib/config';
import { findUserByAuthSubject } from '@/lib/db/users';
import { enqueueUsageEvent, flushUsageEvents } from './usage-queue';

export function meterQuantity(quantity: number, multiplier = 1): number {
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(multiplier) || multiplier <= 0) return 0;
    return Math.ceil(quantity * multiplier);
}

/** Persist first, then send. Provider failures remain available to the usage cron. */
export async function reportUsage(subject: string, type: 'storage' | 'transcription', quantity: number, options?: { multiplier?: number; identifier?: string }) {
    if (!billingEnabled() || !meterQuantity(quantity, options?.multiplier)) return;
    const user = await findUserByAuthSubject(subject);
    if (!user?.stripeCustomerId || !user.billingSettings.allowOverage || user.disabled || user.softDelete?.isDeleted) return;
    const period = user.storagePeakPeriodEnd?.toISOString() || 'unbounded';
    const sourceId = type === 'storage'
        ? `storage:${subject}:${period}`
        : options?.identifier || `transcription:${subject}:${randomUUID()}`;
    const id = createHash('sha256').update(sourceId).digest('hex');
    const value = type === 'storage'
        ? meterQuantity(Math.max(quantity, user.storagePeakUsed))
        : meterQuantity(quantity, options?.multiplier);
    await enqueueUsageEvent({
        _id: id, authSubject: subject, customerId: user.stripeCustomerId, type, value,
        timestamp: Math.floor(Date.now() / 1000),
    });
    await flushUsageEvents(10);
}

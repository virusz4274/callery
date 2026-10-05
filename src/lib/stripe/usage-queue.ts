import { randomUUID } from 'node:crypto';
import type { Db } from 'mongodb';
import { getStripe } from '@/lib/stripe';
import { Collections, getMongoDb } from '@/lib/mongodb';

export interface UsageEvent {
    _id: string;
    authSubject: string;
    customerId: string;
    type: 'storage' | 'transcription';
    value: number;
    reportedValue: number;
    pending: boolean;
    timestamp: number;
    createdAt: Date;
    updatedAt: Date;
    retryAt: Date;
    leaseUntil: Date;
    leaseOwner?: string;
    lastError?: string;
    delivery?: { value: number; timestamp: number };
}

type SendMeterEvent = (event: UsageEvent) => Promise<void>;

async function sendMeterEvent(event: UsageEvent): Promise<void> {
    const identifier = `${event._id}:${event.value}`;
    await getStripe().billing.meterEvents.create({
        identifier,
        event_name: event.type === 'storage' ? 'storage_usage_bytes' : 'transcription_usage_seconds',
        payload: { stripe_customer_id: event.customerId, value: String(event.value) },
        timestamp: event.timestamp,
    }, { idempotencyKey: identifier });
}

/** One lease per account/period prevents smaller peaks arriving after larger ones. */
export async function flushUsageEvents(
    limit = 50,
    dependencies?: { db: Db; send: SendMeterEvent },
): Promise<{ sent: number; failed: number }> {
    const db = dependencies?.db || await getMongoDb();
    const send = dependencies?.send || sendMeterEvent;
    const events = db.collection<UsageEvent>(Collections.USAGE_EVENTS);
    const result = { sent: 0, failed: 0 };
    for (let i = 0; i < limit; i++) {
        const now = new Date();
        const owner = randomUUID();
        const event = await events.findOneAndUpdate(
            { pending: true, retryAt: { $lte: now }, leaseUntil: { $lte: now } },
            [{ $set: {
                leaseOwner: owner,
                leaseUntil: new Date(now.getTime() + 5 * 60_000),
                delivery: { $ifNull: ['$delivery', { value: '$value', timestamp: '$timestamp' }] },
            } }],
            { sort: { createdAt: 1 }, returnDocument: 'after' },
        );
        if (!event) break;
        try {
            const delivery = event.delivery!;
            await send({ ...event, value: delivery.value, timestamp: delivery.timestamp });
            await events.updateOne({ _id: event._id, leaseOwner: owner }, [
                { $set: { reportedValue: { $max: ['$reportedValue', delivery.value] } } },
                { $set: { pending: { $gt: ['$value', '$reportedValue'] }, leaseUntil: new Date(0), updatedAt: new Date() } },
                { $unset: ['leaseOwner', 'lastError', 'delivery'] },
            ]);
            result.sent++;
        } catch (error) {
            await events.updateOne({ _id: event._id, leaseOwner: owner }, {
                $set: { retryAt: new Date(Date.now() + 60_000), leaseUntil: new Date(0), lastError: error instanceof Error ? error.message : 'Meter event failed' },
                $unset: { leaseOwner: '' },
            });
            result.failed++;
        }
    }
    return result;
}

export async function enqueueUsageEvent(
    input: Pick<UsageEvent, '_id' | 'authSubject' | 'customerId' | 'type' | 'value' | 'timestamp'>,
    db?: Db,
): Promise<void> {
    const events = (db || await getMongoDb()).collection<UsageEvent>(Collections.USAGE_EVENTS);
    const now = new Date();
    await events.updateOne({ _id: input._id }, [
        { $set: {
            authSubject: input.authSubject,
            customerId: input.customerId,
            type: input.type,
            value: { $max: [{ $ifNull: ['$value', 0] }, input.value] },
            reportedValue: { $ifNull: ['$reportedValue', 0] },
            timestamp: { $cond: [
                { $gt: [input.value, { $ifNull: ['$value', 0] }] },
                input.timestamp,
                { $ifNull: ['$timestamp', input.timestamp] },
            ] },
            createdAt: { $ifNull: ['$createdAt', now] },
            updatedAt: now,
            retryAt: { $ifNull: ['$retryAt', now] },
            leaseUntil: { $ifNull: ['$leaseUntil', new Date(0)] },
        } },
        { $set: { pending: { $gt: ['$value', '$reportedValue'] } } },
    ], { upsert: true });
}

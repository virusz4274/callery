import type Stripe from 'stripe';
import { MongoServerError, type Db } from 'mongodb';
import { Collections } from '@/lib/mongodb';

export interface StripeWebhookEventDoc {
    _id: string; type: Stripe.Event.Type; status: 'processing' | 'processed' | 'failed';
    createdAt: Date; receivedAt: Date; updatedAt: Date; processedAt?: Date;
    attempts: number; lastError?: string | null; leaseOwner?: string;
}
const STALE_MS = 10 * 60_000;

/** Every acknowledgement is fenced to the lease that performed the work. */
export async function claimWebhookEvent(db: Db, event: Stripe.Event, owner: string): Promise<'claimed' | 'already_processed' | 'in_progress'> {
    const events = db.collection<StripeWebhookEventDoc>(Collections.STRIPE_WEBHOOK_EVENTS);
    const now = new Date();
    try {
        await events.insertOne({ _id: event.id, type: event.type, status: 'processing', createdAt: new Date(event.created * 1000),
            receivedAt: now, updatedAt: now, attempts: 1, leaseOwner: owner });
        return 'claimed';
    } catch (error) {
        if (!(error instanceof MongoServerError && error.code === 11000) && !(error instanceof Error && error.message.includes('E11000'))) throw error;
    }
    const existing = await events.findOne({ _id: event.id });
    if (existing?.status === 'processed') return 'already_processed';
    const retaken = await events.updateOne({ _id: event.id, $or: [
        { status: 'failed' }, { status: 'processing', updatedAt: { $lte: new Date(now.getTime() - STALE_MS) } },
    ] }, { $set: { status: 'processing', updatedAt: now, leaseOwner: owner, lastError: null }, $inc: { attempts: 1 } });
    return retaken.matchedCount ? 'claimed' : 'in_progress';
}

export async function finishWebhookEvent(db: Db, id: string, owner: string, error?: string): Promise<boolean> {
    const result = await db.collection<StripeWebhookEventDoc>(Collections.STRIPE_WEBHOOK_EVENTS).updateOne({ _id: id, status: 'processing', leaseOwner: owner }, {
        $set: { status: error ? 'failed' : 'processed', lastError: error || null, updatedAt: new Date(), ...(!error ? { processedAt: new Date() } : {}) },
        $unset: { leaseOwner: '' },
    });
    return Boolean(result.matchedCount);
}

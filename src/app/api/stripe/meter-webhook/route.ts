import { NextRequest, NextResponse } from 'next/server';
import { MongoServerError } from 'mongodb';
import { getStripe } from '@/lib/stripe';
import { env } from '@/lib/env';
import { getMongoDb } from '@/lib/mongodb';
import { fetchAndReconcileMeterNotification } from '@/lib/stripe/meter-errors';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
/** Stripe v2 thin notifications have a separate signing secret and require fetching the full event. */
export async function POST(req: NextRequest) {
    if (!env.NEXT_PUBLIC_ENABLE_BILLING) return new NextResponse('Billing disabled');
    const secret = process.env.STRIPE_METER_WEBHOOK_SECRET;
    if (!secret) return new NextResponse('Meter notifications are not configured', { status: 503 });
    let notification;
    try { notification = getStripe().parseEventNotification(await req.text(), req.headers.get('stripe-signature') || '', secret); }
    catch { return new NextResponse('Invalid Stripe signature', { status: 400 }); }
    if (!['v1.billing.meter.error_report_triggered', 'v1.billing.meter.no_meter_found'].includes(notification.type)) return new NextResponse('Ignored');
    const db = await getMongoDb(), notifications = db.collection<{ _id: string; state: string; receivedAt: Date; processedAt?: Date }>('stripe_meter_notifications');
    try {
        try { await notifications.insertOne({ _id: notification.id, state: 'processing', receivedAt: new Date() }); }
        catch (error) {
            if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
            if ((await notifications.findOne({ _id: notification.id }))?.state === 'processed') return new NextResponse('Already processed');
        }
        if (notification.type !== 'v1.billing.meter.error_report_triggered' && notification.type !== 'v1.billing.meter.no_meter_found') return new NextResponse('Ignored');
        const report = await fetchAndReconcileMeterNotification(notification, db, id => getStripe().billing.meters.retrieve(id));
        await notifications.updateOne({ _id: notification.id }, { $set: { state: 'processed', processedAt: new Date(), report } });
        if (report.requiresReview) logger.warn('Meter error report requires reconciliation', { notificationId: notification.id, rejected: report.rejected,
            quarantined: report.quarantined, unmatched: report.unmatched, unsampledErrors: report.unsampledErrors });
        return new NextResponse('Received');
    } catch (error) {
        logger.error('Meter notification reconciliation failed', error);
        return new NextResponse('Meter notification retained for retry', { status: 503 });
    }
}

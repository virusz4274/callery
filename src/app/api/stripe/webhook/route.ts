import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { linkCustomerToUser, syncSubscription } from '@/lib/stripe/sync';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
    const body = await req.text();
    const sig = req.headers.get('stripe-signature') as string;

    let event: Stripe.Event;

    try {
        if (!process.env.STRIPE_WEBHOOK_SECRET) {
            throw new Error('STRIPE_WEBHOOK_SECRET is not set');
        }
        event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
        console.error(`Webhook Error: ${err.message}`);
        return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                // We use client_reference_id to pass the Firebase UID from the frontend
                const firebaseUid = session.client_reference_id || session.metadata?.firebaseUid;

                if (!session.customer || !firebaseUid) {
                    console.error('Missing customer or firebaseUid (client_reference_id) in session');
                    break;
                }

                await linkCustomerToUser(session.customer as string, firebaseUid);

                // Immediately sync the subscription too if present (avoids race condition)
                if (session.subscription) {
                    await syncSubscription(session.subscription as string);
                }
                break;
            }

            case 'customer.subscription.created':
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted': {
                const subscription = event.data.object as Stripe.Subscription;
                await syncSubscription(subscription.id);
                break;
            }

            case 'invoice.payment_succeeded': {
                const invoice = event.data.object as Stripe.Invoice;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if ((invoice as any).subscription) {
                    await syncSubscription((invoice as any).subscription as string);
                }
                break;
            }

            default:
            // console.log(`Unhandled event type ${event.type}`);
        }
    } catch (err: any) {
        console.error(`Error processing webhook: ${err.message}`);
        return new NextResponse('Internal Server Error', { status: 500 });
    }

    return new NextResponse('Received', { status: 200 });
}

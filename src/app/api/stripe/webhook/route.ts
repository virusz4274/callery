import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { linkCustomerToUser, syncSubscription } from '@/lib/stripe/sync';
import Stripe from 'stripe';
import { logger } from '@/lib/logger';
import { createNotification } from '@/lib/notifications';
import { findUserByStripeCustomerId } from '@/lib/db/users';

export async function POST(req: NextRequest) {
    const body = await req.text();
    const sig = req.headers.get('stripe-signature') as string;

    let event: Stripe.Event;

    try {
        if (!process.env.STRIPE_WEBHOOK_SECRET) {
            throw new Error('STRIPE_WEBHOOK_SECRET is not set');
        }
        event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown webhook validation error';
        logger.error(`Webhook Error: ${errorMessage}`);
        return new NextResponse(`Webhook Error: ${errorMessage}`, { status: 400 });
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                // We use client_reference_id to pass the Firebase UID from the frontend
                const firebaseUid = session.client_reference_id || session.metadata?.firebaseUid;

                if (!session.customer || !firebaseUid) {
                    logger.error('Missing customer or firebaseUid (client_reference_id) in session');
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

                // Notify User
                const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
                const user = await findUserByStripeCustomerId(customerId);
                if (user) {
                    if (event.type === 'customer.subscription.created') {
                        await createNotification(
                            user._id,
                            'success',
                            'Subscription Activated',
                            'Your subscription is now active.',
                            '/settings?tab=billing'
                        );
                    } else if (event.type === 'customer.subscription.updated' && subscription.cancel_at_period_end) {
                        await createNotification(
                            user._id,
                            'warning',
                            'Cancellation Scheduled',
                            'Your subscription is set to cancel at the end of the current billing period.',
                            '/settings?tab=billing'
                        );
                    } else if (event.type === 'customer.subscription.deleted' || subscription.status === 'canceled') {
                        await createNotification(
                            user._id,
                            'warning',
                            'Subscription Cancelled',
                            'Your subscription has been cancelled. You have been downgraded to the free plan.',
                            '/settings?tab=billing'
                        );
                    }
                }
                break;
            }

            case 'invoice.payment_failed':
            case 'invoice.payment_action_required': {
                const invoice = event.data.object as Stripe.Invoice;
                const invoiceWithSubscription = invoice as Stripe.Invoice & {
                    subscription?: string | Stripe.Subscription | null;
                };
                // If the invoice is associated with a subscription, sync it to update status to 'past_due' or 'unpaid'
                const subscriptionId = typeof invoiceWithSubscription.subscription === 'string'
                    ? invoiceWithSubscription.subscription
                    : invoiceWithSubscription.subscription?.id;
                if (subscriptionId) {
                    await syncSubscription(subscriptionId);
                }

                // Notify User
                const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
                if (customerId) {
                    const user = await findUserByStripeCustomerId(customerId);
                    if (user) {
                        await createNotification(
                            user._id,
                            'error',
                            'Payment Failed',
                            'We were unable to process your payment. Please update your payment method to avoid service interruption.',
                            '/settings?tab=billing'
                        );
                    }
                }
                break;
            }

            case 'invoice.payment_succeeded': {
                const invoice = event.data.object as Stripe.Invoice;
                const invoiceWithSubscription = invoice as Stripe.Invoice & {
                    subscription?: string | Stripe.Subscription | null;
                };
                const subscriptionId = typeof invoiceWithSubscription.subscription === 'string'
                    ? invoiceWithSubscription.subscription
                    : invoiceWithSubscription.subscription?.id;
                if (subscriptionId) {
                    await syncSubscription(subscriptionId);
                }
                break;
            }

            default:
            // logger.debug(`Unhandled event type ${event.type}`);
        }
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown webhook processing error';
        logger.error(`Error processing webhook: ${errorMessage}`);
        return new NextResponse('Internal Server Error', { status: 500 });
    }

    return new NextResponse('Received', { status: 200 });
}

import { NextRequest, NextResponse } from 'next/server';
import { MongoServerError } from 'mongodb';
import { stripe } from '@/lib/stripe';
import { applyOneTimeCheckoutPlan, linkCustomerToUser, syncSubscription } from '@/lib/stripe/sync';
import Stripe from 'stripe';
import { logger } from '@/lib/logger';
import { createNotification } from '@/lib/notifications';
import { findUserByStripeCustomerId } from '@/lib/db/users';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { User } from '@/lib/db/types';

export const runtime = 'nodejs';

type StripeWebhookEventStatus = 'processing' | 'processed' | 'failed';

type StripeWebhookEventDoc = {
    _id: string; // Stripe Event ID
    type: Stripe.Event.Type;
    status: StripeWebhookEventStatus;
    createdAt: Date;
    receivedAt: Date;
    updatedAt: Date;
    processedAt?: Date;
    attempts: number;
    lastError?: string | null;
};

const WEBHOOK_PROCESSING_STALE_MS = 10 * 60 * 1000;

function isDuplicateKeyError(error: unknown): boolean {
    if (error instanceof MongoServerError) {
        return error.code === 11000;
    }

    return error instanceof Error && error.message.includes('E11000');
}

async function claimWebhookEvent(event: Stripe.Event): Promise<'claimed' | 'already_processed' | 'in_progress'> {
    const db = await getMongoDb();
    const events = db.collection<StripeWebhookEventDoc>(Collections.STRIPE_WEBHOOK_EVENTS);
    const now = new Date();

    try {
        const result = await events.updateOne(
            {
                _id: event.id,
                $or: [{ status: { $exists: false } }, { status: 'failed' }],
            },
            {
                $setOnInsert: {
                    createdAt: new Date(event.created * 1000),
                    receivedAt: now,
                },
                $set: {
                    type: event.type,
                    status: 'processing',
                    updatedAt: now,
                    lastError: null,
                },
                $inc: {
                    attempts: 1,
                },
            },
            { upsert: true }
        );

        if (result.matchedCount > 0 || result.upsertedCount > 0) {
            return 'claimed';
        }

        return 'in_progress';
    } catch (error) {
        if (!isDuplicateKeyError(error)) {
            throw error;
        }

        const existing = await events.findOne({ _id: event.id });
        if (existing?.status === 'processed') {
            return 'already_processed';
        }

        if (existing?.status === 'failed') {
            const retry = await events.updateOne(
                { _id: event.id, status: 'failed' },
                {
                    $set: {
                        status: 'processing',
                        updatedAt: now,
                        lastError: null,
                        type: event.type,
                    },
                    $inc: { attempts: 1 },
                }
            );
            if (retry.modifiedCount > 0) {
                return 'claimed';
            }
        }

        if (existing?.status === 'processing' && now.getTime() - existing.updatedAt.getTime() > WEBHOOK_PROCESSING_STALE_MS) {
            const takeover = await events.updateOne(
                { _id: event.id, status: 'processing', updatedAt: existing.updatedAt },
                {
                    $set: {
                        status: 'processing',
                        updatedAt: now,
                        lastError: null,
                        type: event.type,
                    },
                    $inc: { attempts: 1 },
                }
            );
            if (takeover.modifiedCount > 0) {
                return 'claimed';
            }
        }

        return 'in_progress';
    }
}

async function markWebhookProcessed(eventId: string) {
    const db = await getMongoDb();
    await db.collection<StripeWebhookEventDoc>(Collections.STRIPE_WEBHOOK_EVENTS).updateOne(
        { _id: eventId },
        {
            $set: {
                status: 'processed',
                processedAt: new Date(),
                updatedAt: new Date(),
                lastError: null,
            },
        }
    );
}

async function markWebhookFailed(eventId: string, errorMessage: string) {
    const db = await getMongoDb();
    await db.collection<StripeWebhookEventDoc>(Collections.STRIPE_WEBHOOK_EVENTS).updateOne(
        { _id: eventId },
        {
            $set: {
                status: 'failed',
                lastError: errorMessage,
                updatedAt: new Date(),
            },
        }
    );
}

function getCustomerIdFromCheckoutSession(session: Stripe.Checkout.Session): string | null {
    if (typeof session.customer === 'string') {
        return session.customer;
    }

    return session.customer?.id ?? null;
}

function getCustomerIdFromSubscription(subscription: Stripe.Subscription): string {
    return typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
}

function getCustomerIdFromInvoice(invoice: Stripe.Invoice): string | null {
    if (!invoice.customer) {
        return null;
    }

    return typeof invoice.customer === 'string' ? invoice.customer : invoice.customer.id;
}

function getInvoiceSubscriptionId(
    invoice: Stripe.Invoice
): string | null {
    const withSubscription = invoice as Stripe.Invoice & {
        subscription?: string | Stripe.Subscription | null;
    };

    if (!withSubscription.subscription) {
        return null;
    }

    return typeof withSubscription.subscription === 'string'
        ? withSubscription.subscription
        : withSubscription.subscription.id;
}

async function handleCheckoutSessionEvent(
    session: Stripe.Checkout.Session,
    eventType: Stripe.Event.Type
) {
    const firebaseUid = session.client_reference_id || session.metadata?.firebaseUid;
    const customerId = getCustomerIdFromCheckoutSession(session);

    if (customerId && firebaseUid) {
        await linkCustomerToUser(customerId, firebaseUid);
    }

    if (session.mode === 'subscription') {
        if (session.subscription) {
            const subscriptionId =
                typeof session.subscription === 'string'
                    ? session.subscription
                    : session.subscription.id;
            await syncSubscription(subscriptionId);
        }
        return;
    }

    if (session.mode === 'payment') {
        const isPaid =
            session.payment_status === 'paid' || eventType === 'checkout.session.async_payment_succeeded';

        if (!isPaid) {
            logger.warn(`[Stripe Webhook] Checkout session ${session.id} is not paid yet, skipping one-time plan sync`);
            return;
        }

        await applyOneTimeCheckoutPlan(session);
    }
}

async function handleStripeCustomerDeleted(customerId: string) {
    const db = await getMongoDb();
    const user = await db.collection<User>(Collections.USERS).findOne({ stripeCustomerId: customerId });
    if (!user) {
        return;
    }

    await db.collection<User>(Collections.USERS).updateOne(
        { _id: user._id },
        {
            $set: {
                'billingSettings.allowOverage': false,
                updatedAt: new Date(),
            },
            $unset: {
                stripeCustomerId: '',
                stripeSubscriptionId: '',
                stripePriceId: '',
                stripeSubscriptionStatus: '',
                stripeCurrentPeriodEnd: '',
            },
        }
    );

    await createNotification(
        user._id,
        'warning',
        'Billing Account Reset',
        'Your Stripe billing account was removed. Re-open billing settings to reconnect payment.',
        '/settings?tab=billing'
    );
}

export async function POST(req: NextRequest) {
    if (process.env.NEXT_PUBLIC_ENABLE_BILLING === 'false') {
        return new NextResponse('Billing disabled', { status: 200 });
    }

    const body = await req.text();
    const sig = req.headers.get('stripe-signature');

    let event: Stripe.Event;

    try {
        if (!process.env.STRIPE_WEBHOOK_SECRET) {
            throw new Error('STRIPE_WEBHOOK_SECRET is not set');
        }
        if (!sig) {
            throw new Error('Missing stripe-signature header');
        }
        event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown webhook validation error';
        logger.error(`Webhook Error: ${errorMessage}`);
        return new NextResponse(`Webhook Error: ${errorMessage}`, { status: 400 });
    }

    try {
        const claimStatus = await claimWebhookEvent(event);
        if (claimStatus === 'already_processed') {
            return new NextResponse('Already processed', { status: 200 });
        }
        if (claimStatus === 'in_progress') {
            return new NextResponse('Processing', { status: 200 });
        }
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown webhook claim error';
        logger.error(`Webhook claim error: ${errorMessage}`);
        return new NextResponse('Internal Server Error', { status: 500 });
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                await handleCheckoutSessionEvent(session, event.type);
                break;
            }

            case 'checkout.session.async_payment_succeeded': {
                const session = event.data.object as Stripe.Checkout.Session;
                await handleCheckoutSessionEvent(session, event.type);
                break;
            }

            case 'checkout.session.async_payment_failed': {
                const session = event.data.object as Stripe.Checkout.Session;
                const customerId = getCustomerIdFromCheckoutSession(session);
                if (customerId) {
                    const user = await findUserByStripeCustomerId(customerId);
                    if (user) {
                        await createNotification(
                            user._id,
                            'error',
                            'Payment Failed',
                            'Your checkout payment failed. Please try again with another payment method.',
                            '/settings?tab=billing'
                        );
                    }
                }
                break;
            }

            case 'checkout.session.expired': {
                const session = event.data.object as Stripe.Checkout.Session;
                const customerId = getCustomerIdFromCheckoutSession(session);
                if (customerId) {
                    const user = await findUserByStripeCustomerId(customerId);
                    if (user) {
                        await createNotification(
                            user._id,
                            'warning',
                            'Checkout Expired',
                            'Your checkout session expired before payment completion.',
                            '/settings?tab=billing'
                        );
                    }
                }
                break;
            }

            case 'customer.subscription.created':
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted':
            case 'customer.subscription.paused':
            case 'customer.subscription.resumed':
            case 'customer.subscription.pending_update_applied':
            case 'customer.subscription.pending_update_expired': {
                const subscription = event.data.object as Stripe.Subscription;
                await syncSubscription(subscription.id);

                // Notify User
                const customerId = getCustomerIdFromSubscription(subscription);
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
                            'Your subscription has been cancelled.',
                            '/settings?tab=billing'
                        );
                    } else if (event.type === 'customer.subscription.paused') {
                        await createNotification(
                            user._id,
                            'warning',
                            'Subscription Paused',
                            'Your subscription is paused. Update billing details to resume service.',
                            '/settings?tab=billing'
                        );
                    } else if (event.type === 'customer.subscription.resumed') {
                        await createNotification(
                            user._id,
                            'success',
                            'Subscription Resumed',
                            'Your subscription has resumed successfully.',
                            '/settings?tab=billing'
                        );
                    } else if (event.type === 'customer.subscription.pending_update_expired') {
                        await createNotification(
                            user._id,
                            'warning',
                            'Plan Update Expired',
                            'A pending subscription change expired before completion.',
                            '/settings?tab=billing'
                        );
                    }
                }
                break;
            }

            case 'customer.subscription.trial_will_end': {
                const subscription = event.data.object as Stripe.Subscription;
                const customerId = getCustomerIdFromSubscription(subscription);
                const user = await findUserByStripeCustomerId(customerId);
                if (user) {
                    await createNotification(
                        user._id,
                        'info',
                        'Trial Ending Soon',
                        'Your trial is ending soon. Add a payment method to avoid interruption.',
                        '/settings?tab=billing'
                    );
                }
                break;
            }

            case 'invoice.payment_failed':
            case 'invoice.payment_action_required': {
                const invoice = event.data.object as Stripe.Invoice;
                // If the invoice is associated with a subscription, sync it to update status to 'past_due' or 'unpaid'
                const subscriptionId = getInvoiceSubscriptionId(invoice);
                if (subscriptionId) {
                    await syncSubscription(subscriptionId);
                }

                // Notify User
                const customerId = getCustomerIdFromInvoice(invoice);
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
                const subscriptionId = getInvoiceSubscriptionId(invoice);
                if (subscriptionId) {
                    await syncSubscription(subscriptionId);
                }
                break;
            }

            case 'invoice.paid': {
                const invoice = event.data.object as Stripe.Invoice;
                const subscriptionId = getInvoiceSubscriptionId(invoice);
                if (subscriptionId) {
                    await syncSubscription(subscriptionId);
                }
                break;
            }

            case 'invoice.voided':
            case 'invoice.marked_uncollectible': {
                const invoice = event.data.object as Stripe.Invoice;
                const subscriptionId = getInvoiceSubscriptionId(invoice);
                if (subscriptionId) {
                    await syncSubscription(subscriptionId);
                }
                break;
            }

            case 'customer.deleted': {
                const customer = event.data.object as Stripe.Customer | Stripe.DeletedCustomer;
                await handleStripeCustomerDeleted(customer.id);
                break;
            }

            default:
                logger.info(`[Stripe Webhook] Unhandled event type ${event.type} (acknowledged without action)`);
        }

        await markWebhookProcessed(event.id);
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown webhook processing error';
        await markWebhookFailed(event.id, errorMessage);
        logger.error(`Error processing webhook: ${errorMessage}`);
        return new NextResponse('Internal Server Error', { status: 500 });
    }

    return new NextResponse('Received', { status: 200 });
}

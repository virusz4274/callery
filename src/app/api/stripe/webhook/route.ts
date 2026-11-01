import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { claimWebhookEvent, finishWebhookEvent } from '@/lib/stripe/webhook-events';
import { getInvoiceSubscriptionId, stripeObjectId } from '@/lib/stripe/objects';
import { syncFailedCheckout } from '@/lib/stripe/checkout';
import { syncInvoicePaymentIssue } from '@/lib/stripe/payment-issues';
import { getStripe } from '@/lib/stripe';
import { applyOneTimeCheckoutPlan, isVerifiedSubscriptionActivation, linkCustomerToUser, syncSubscription } from '@/lib/stripe/sync';
import Stripe from 'stripe';
import { logger } from '@/lib/logger';
import { createNotification } from '@/lib/notifications';
import { findUserByStripeCustomerId } from '@/lib/db/users';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { User } from '@/lib/db/types';
import { env } from '@/lib/env';
import { confirmUsageTopup, confirmAutomaticUsageTopup, suspendPrepaidForCharge, syncUsageCreditGrant } from '@/lib/stripe/prepaid-topup';
import { syncPaidInvoiceFunding } from '@/lib/stripe/invoice-funding';
import { advancePlanChange, BILLING_OPERATIONS, type BillingChangeOperation } from '@/lib/stripe/plan-change';
import { billingFence, withBillingLease } from '@/lib/stripe/billing-lock';
import { verifyUsageInvoice } from '@/lib/stripe/invoice-verification';
import { markCatalogDiscoveryDirty } from '@/lib/stripe/catalog-discovery';
import { syncCreditNoteReview } from '@/lib/stripe/credit-notes';
import { sourcePlanUsableWhileAwaitingPayment } from '@/lib/stripe/billing-types';

export const runtime = 'nodejs';

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

async function handleCheckoutSessionEvent(
    reference: Stripe.Checkout.Session
) {
    const session = await getStripe().checkout.sessions.retrieve(reference.id);
    if (await confirmUsageTopup(session.id)) return;
    const authSubject = session.client_reference_id || session.metadata?.authSubject;
    const customerId = getCustomerIdFromCheckoutSession(session);

    if (customerId && authSubject) {
        await linkCustomerToUser(customerId, authSubject);
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
            session.payment_status === 'paid' || (session.payment_status === 'no_payment_required' && session.amount_total === 0);

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

    await withBillingLease(db, user.authSubject, async (current, owner) => {
        if (current.stripeCustomerId !== customerId) return;
        await db.collection<User>(Collections.USERS).updateOne(
        billingFence(current, owner), {
            $set: {
                'billingSettings.allowOverage': false,
                stripeSubscriptionStatus: 'canceled',
                billingReview: { reason: 'customer_deleted_with_financial_history', createdAt: new Date() },
                ...(user.lifetimeUsageSetup ? { 'lifetimeUsageSetup.state': 'needs_action', 'lifetimeUsageSetup.lastErrorCode': 'customer_removed' } : {}),
                updatedAt: new Date(),
            },
            $inc: { stripeCustomerGeneration: 1 },
            $unset: {
                stripeSubscriptionId: '',
                stripePriceId: '',
                stripeMetering: '',
                stripeCurrentPeriodEnd: '',
                stripeCurrentPeriodStart: '',
            },
        }
        );
    });

    await createNotification(
        user._id,
        'warning',
        'Billing Account Reset',
        'Your Stripe billing account was removed. Contact support to review the billing history and restore payment.',
        '/settings?tab=billing'
    );
}

export async function POST(req: NextRequest) {
    if (!env.NEXT_PUBLIC_ENABLE_BILLING) {
        return new NextResponse('Billing disabled', { status: 200 });
    }

    const body = await req.text();
    const sig = req.headers.get('stripe-signature');

    let event: Stripe.Event;

    try {
        if (!sig) {
            throw new Error('Missing stripe-signature header');
        }
        event = getStripe().webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET);
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown webhook validation error';
        logger.error(`Webhook Error: ${errorMessage}`);
        return new NextResponse(`Webhook Error: ${errorMessage}`, { status: 400 });
    }

    const owner = randomUUID();
    const db = await getMongoDb();
    try {
        const claimStatus = await claimWebhookEvent(db, event, owner);
        if (claimStatus === 'already_processed') {
            return new NextResponse('Already processed', { status: 200 });
        }
        if (claimStatus === 'in_progress') {
            return new NextResponse('Processing; retry delivery', { status: 503 });
        }
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown webhook claim error';
        logger.error(`Webhook claim error: ${errorMessage}`);
        return new NextResponse('Internal Server Error', { status: 500 });
    }

    try {
        switch (event.type) {
            case 'price.created':
            case 'price.updated':
            case 'price.deleted':
            case 'product.created':
            case 'product.updated':
            case 'product.deleted':
            case 'billing.meter.created':
            case 'billing.meter.updated':
            case 'billing.meter.deactivated':
            case 'billing.meter.reactivated': {
                await markCatalogDiscoveryDirty(event.data.object.id, await getMongoDb());
                break;
            }

            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                await handleCheckoutSessionEvent(session);
                break;
            }

            case 'checkout.session.async_payment_succeeded': {
                const session = event.data.object as Stripe.Checkout.Session;
                await handleCheckoutSessionEvent(session);
                break;
            }

            case 'checkout.session.async_payment_failed': {
                const session = event.data.object as Stripe.Checkout.Session;
                await syncFailedCheckout(session.id);
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
                await syncFailedCheckout(session.id);
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
                    if (event.type === 'customer.subscription.created' && isVerifiedSubscriptionActivation(user, subscription.id)) {
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
                await syncInvoicePaymentIssue(invoice.id, event.type === 'invoice.payment_action_required' ? 'action_required' : 'failed');

                // Notify User
                const customerId = getCustomerIdFromInvoice(invoice);
                if (customerId) {
                    const user = await findUserByStripeCustomerId(customerId);
                    if (user) {
                        const optionalChange = user.billingOperation?.invoiceId === invoice.id && sourcePlanUsableWhileAwaitingPayment(user);
                        if (optionalChange) {
                            await createNotification(user._id, 'info', 'Complete your plan change payment',
                                'Complete payment and any bank verification on Stripe. Your current paid plan remains active while this change is unpaid.',
                                '/settings?tab=billing');
                        } else if (user.stripePaymentIssues?.[invoice.id]) {
                            await createNotification(user._id, 'error', 'Payment Failed',
                                'We were unable to process your payment. Please update your payment method to avoid service interruption.',
                                '/settings?tab=billing');
                        }
                    }
                }
                break;
            }

            case 'invoice.payment_succeeded': {
                const invoice = event.data.object as Stripe.Invoice;
                await verifyUsageInvoice(invoice.id);
                await syncPaidInvoiceFunding(invoice.id);
                await syncInvoicePaymentIssue(invoice.id, 'reconcile');
                const subscriptionId = getInvoiceSubscriptionId(invoice);
                if (subscriptionId) {
                    await syncSubscription(subscriptionId);
                }
                break;
            }

            case 'invoice.paid': {
                const invoice = event.data.object as Stripe.Invoice;
                await verifyUsageInvoice(invoice.id);
                await syncPaidInvoiceFunding(invoice.id);
                await syncInvoicePaymentIssue(invoice.id, 'reconcile');
                const subscriptionId = getInvoiceSubscriptionId(invoice);
                if (subscriptionId) {
                    await syncSubscription(subscriptionId);
                }
                break;
            }

            case 'invoice.finalized': {
                await verifyUsageInvoice((event.data.object as Stripe.Invoice).id);
                break;
            }

            case 'payment_intent.succeeded': {
                await confirmAutomaticUsageTopup((event.data.object as Stripe.PaymentIntent).id);
                break;
            }

            case 'billing.credit_grant.updated': {
                await syncUsageCreditGrant((event.data.object as Stripe.Billing.CreditGrant).id);
                break;
            }

            case 'credit_note.created':
            case 'credit_note.updated':
            case 'credit_note.voided': {
                await syncCreditNoteReview((event.data.object as Stripe.CreditNote).id);
                break;
            }

            case 'invoice.voided':
            case 'invoice.marked_uncollectible': {
                const invoice = event.data.object as Stripe.Invoice;
                await syncInvoicePaymentIssue(invoice.id, 'reconcile');
                const subscriptionId = getInvoiceSubscriptionId(invoice);
                if (subscriptionId) {
                    await syncSubscription(subscriptionId);
                }
                break;
            }

            case 'charge.refunded':
            case 'charge.dispute.created':
            case 'charge.dispute.closed':
            case 'refund.created':
            case 'refund.updated': {
                const object = event.data.object as unknown as { id: string; object: string; charge?: string | Stripe.Charge | null };
                const chargeId = object.object === 'charge' ? object.id : stripeObjectId(object.charge);
                if (chargeId) {
                    await suspendPrepaidForCharge(chargeId);
                    const charge = await getStripe().charges.retrieve(chargeId);
                    const customerId = stripeObjectId(charge.customer);
                    if (customerId) await db.collection<User>(Collections.USERS).updateOne({ stripeCustomerId: customerId }, {
                        $set: { billingReview: { reason: 'refund_or_dispute', createdAt: new Date() }, updatedAt: new Date() },
                    });
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

        const object = event.data.object as unknown as { customer?: string | { id: string } };
        const customerId = stripeObjectId(object.customer);
        if (customerId) {
            const operation = await db.collection<BillingChangeOperation>(BILLING_OPERATIONS).findOne({ customerId,
                state: { $in: ['applying', 'awaiting_payment'] } });
            if (operation) await advancePlanChange(operation._id);
        }

        if (!await finishWebhookEvent(db, event.id, owner)) return new NextResponse('Processing lease changed; retry delivery', { status: 503 });
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown webhook processing error';
        await finishWebhookEvent(db, event.id, owner, errorMessage);
        logger.error(`Error processing webhook: ${errorMessage}`);
        return new NextResponse('Internal Server Error', { status: 500 });
    }

    return new NextResponse('Received', { status: 200 });
}

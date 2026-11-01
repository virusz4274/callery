import 'server-only';
import type Stripe from 'stripe';
import type { Db } from 'mongodb';
import type { User } from '@/lib/db/types';
import { Collections } from '@/lib/mongodb';
import { getStripe } from '@/lib/stripe';
import { billingDependencies, type BillingDependencies } from './runtime';
import { billingFence, BillingBusyError, withBillingLease } from './billing-lock';
import { BillingSyncPendingError } from './billing-errors';
import { completeInvoiceLines } from './invoice-funding';
import { getInvoiceSubscriptionId, invoiceLinePriceId, stripeObjectId } from './objects';
import type { BillingChangeOperation } from './plan-change';
import { assertHostedPlanInvoice } from './plan-change-payment';
import type { PaidBasePeriod } from './billing-types';
export type { PaidBasePeriod } from './billing-types';

function validPaidInvoice(invoice: Stripe.Invoice, customerId: string): boolean {
    return stripeObjectId(invoice.customer) === customerId && invoice.currency === 'usd' && invoice.status === 'paid'
        && invoice.amount_remaining === 0 && (invoice.amount_due <= 0 || invoice.amount_paid > 0)
        && !(invoice.post_payment_credit_notes_amount || invoice.pre_payment_credit_notes_amount);
}
/** Payment proof uses principal and reversals; no processor-fee or provider-expense evidence. */
async function assertInvoicePaymentsIntact(invoice: Stripe.Invoice, customerId: string, runtime: BillingDependencies) {
    if (!validPaidInvoice(invoice, customerId)) throw new BillingSyncPendingError('The current plan payment is being confirmed.');
    if (!invoice.amount_paid) return; // Stripe-confirmed zero-balance invoices are valid purchases.
    let amount = 0;
    for await (const payment of runtime.stripe.invoicePayments.list({ invoice: invoice.id, limit: 100 })) {
        if (payment.status !== 'paid') continue;
        const intentId = stripeObjectId(payment.payment.payment_intent);
        if (payment.payment.type !== 'payment_intent' || !intentId || stripeObjectId(payment.invoice) !== invoice.id
            || payment.currency !== invoice.currency || !Number.isSafeInteger(payment.amount_paid) || payment.amount_paid! <= 0) throw new BillingSyncPendingError('The current plan payment requires verification.');
        const intent = await runtime.stripe.paymentIntents.retrieve(intentId, { expand: ['latest_charge'] });
        const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
        if (intent.id !== intentId || intent.status !== 'succeeded' || stripeObjectId(intent.customer) !== customerId
            || intent.currency !== invoice.currency || intent.amount_received < payment.amount_paid!
            || !charge?.paid || charge.refunded || charge.disputed || charge.amount_refunded) throw new BillingSyncPendingError('The current plan payment was reversed or remains unverified.');
        amount += payment.amount_paid!;
    }
    if (amount < invoice.amount_paid) throw new BillingSyncPendingError('The current plan payment settlement is being confirmed.');
}
/** Confirm one paid base period. Annual base proof naturally covers twelve monthly usage windows. */
export async function assertCurrentBasePeriodPaid(subscription: Stripe.Subscription, user: User, runtime: BillingDependencies, paidOperation?: BillingChangeOperation): Promise<PaidBasePeriod | undefined> {
    if (stripeObjectId(subscription.customer) !== user.stripeCustomerId || subscription.id !== user.stripeSubscriptionId
        || subscription.status !== 'active') throw new BillingSyncPendingError();
    const base = subscription.items.data.filter(item => item.price.recurring?.usage_type !== 'metered');
    if (!base.length && user.lifetimePurchase && user.billingEntitlement?.source === 'lifetime') return;
    if (base.length !== 1 || (base[0].quantity || 1) !== 1 || subscription.items.has_more) throw new BillingSyncPendingError('The current paid plan items require verification.');
    const item = base[0], proof = user.billingPaidBasePeriod;
    if (proof && proof.customerId === user.stripeCustomerId && proof.customerGeneration === (user.stripeCustomerGeneration || 0)
        && proof.subscriptionId === subscription.id && proof.basePriceId === item.price.id && proof.start.getTime() <= item.current_period_start * 1000
        && proof.end.getTime() >= item.current_period_end * 1000) return proof;
    const makeProof = (invoiceId: string): PaidBasePeriod => ({ customerId: user.stripeCustomerId!, customerGeneration: user.stripeCustomerGeneration || 0,
        subscriptionId: subscription.id, basePriceId: item.price.id, start: new Date(item.current_period_start * 1000), end: new Date(item.current_period_end * 1000), invoiceId });
    const acceptsNative = async (invoice: Stripe.Invoice) => {
        if (!validPaidInvoice(invoice, user.stripeCustomerId!) || getInvoiceSubscriptionId(invoice) !== subscription.id) return false;
        const lines = await completeInvoiceLines(runtime.stripe, invoice);
        if (!lines.some(line => line.currency === subscription.currency && invoiceLinePriceId(line) === item.price.id && line.quantity === 1
            && line.period.start === item.current_period_start && line.period.end === item.current_period_end
            && line.parent?.subscription_item_details?.subscription === subscription.id
            && line.parent.subscription_item_details.subscription_item === item.id
            && line.parent.subscription_item_details.proration === false)) return false;
        await assertInvoicePaymentsIntact(invoice, user.stripeCustomerId!, runtime); return true;
    };
    const latestId = stripeObjectId(subscription.latest_invoice);
    if (latestId) {
        const invoice = await runtime.stripe.invoices.retrieve(latestId);
        if (await acceptsNative(invoice)) return makeProof(invoice.id);
    }
    const operations = await runtime.db.collection<BillingChangeOperation>('billing_operations').find({ authSubject: user.authSubject,
        customerId: user.stripeCustomerId, subscriptionId: subscription.id, state: 'applied', paymentMode: 'hosted_invoice', 'target.stripePriceId': item.price.id }).toArray();
    if (paidOperation && paidOperation.authSubject === user.authSubject && paidOperation.customerId === user.stripeCustomerId
        && paidOperation.subscriptionId === subscription.id && paidOperation.target.stripePriceId === item.price.id && paidOperation.paymentMode === 'hosted_invoice') operations.unshift(paidOperation);
    for (const operation of operations) {
        const service = operation.hostedInvoice?.lines.filter(line => line.role === 'base' && line.originalPriceId === item.price.id);
        if (!operation.invoiceId || service?.length !== 1 || service[0].period.start < item.current_period_start || service[0].period.start >= item.current_period_end
            || service[0].period.end !== item.current_period_end || operation.params.items?.[0]?.id !== item.id) continue;
        const invoice = await runtime.stripe.invoices.retrieve(operation.invoiceId);
        if (!validPaidInvoice(invoice, user.stripeCustomerId!)) continue;
        await assertHostedPlanInvoice(operation, invoice, runtime.stripe);
        await assertInvoicePaymentsIntact(invoice, user.stripeCustomerId!, runtime);
        // The proof identifies the existing billing window; the immutable hosted
        // receipt records the exact paid upgrade start within that same window.
        return makeProof(invoice.id);
    }
    for await (const invoice of runtime.stripe.invoices.list({ customer: user.stripeCustomerId!, subscription: subscription.id, status: 'paid', limit: 100 })) {
        if (invoice.id !== latestId && await acceptsNative(invoice)) return makeProof(invoice.id);
    }
    throw new BillingSyncPendingError('The renewal payment is being confirmed. Your new included allowance becomes available after payment.');
}

/** Used only for a missing/expired cache, before ledger CAS and outside another billing lease. */
export async function refreshPaidBasePeriod(subject: string, dependencies?: { db: Db; stripe?: Stripe }): Promise<PaidBasePeriod | undefined> {
    const runtime = dependencies ? { db: dependencies.db, stripe: dependencies.stripe || getStripe() } : await billingDependencies();
    return withBillingLease(runtime.db, subject, async (user, owner) => {
        if (user.billingEntitlement?.source !== 'subscription' || !user.stripeSubscriptionId) return;
        const subscription = await runtime.stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        const proof = await assertCurrentBasePeriodPaid(subscription, user, runtime);
        if (proof) {
            const result = await runtime.db.collection<User>(Collections.USERS).updateOne(billingFence(user, owner), { $set: { billingPaidBasePeriod: proof } });
            if (!result.matchedCount) throw new BillingBusyError();
        }
        return proof;
    });
}

import { hasBlockingBillingReview } from './financial-review';
import type Stripe from 'stripe';
import { Collections } from '@/lib/mongodb';
import type { User } from '@/lib/db/types';
import { billingDependencies, type BillingDependencies } from './runtime';
import { billingFence, BillingBusyError, withBillingLease } from './billing-lock';
import { getInvoiceSubscriptionId, stripeObjectId } from './objects';
import { DELETED_BILLING_ACCOUNTS } from './financial-settlement';
import type { BillingChangeOperation } from './plan-change';
import { assertHostedPlanInvoice } from './plan-change-payment';

/** An unpaid optional purchase is not debt for service already delivered. Only
 * the exact, unconsumed hosted operation can qualify for this exception. */
async function isUnpaidPlanOffer(user: User, invoice: Stripe.Invoice, runtime: BillingDependencies): Promise<boolean> {
    if (invoice.metadata?.purpose !== 'plan_change_payment' || !invoice.metadata.billingOperationId) return false;
    const operation = await runtime.db.collection<BillingChangeOperation>('billing_operations').findOne({
        _id: invoice.metadata.billingOperationId, authSubject: user.authSubject, customerId: user.stripeCustomerId,
    });
    if (!operation || operation.paymentMode !== 'hosted_invoice' || operation.remoteStartedAt || operation.appliedAt) return false;
    await assertHostedPlanInvoice(operation, invoice, runtime.stripe);
    return true;
}

/** Invoice debt survives subscription changes and personal account deletion. */
export async function syncInvoicePaymentIssue(invoiceId: string, kind: 'failed' | 'action_required' | 'reconcile', dependencies?: BillingDependencies) {
    const { db, stripe } = await billingDependencies(dependencies);
    const initial = await stripe.invoices.retrieve(invoiceId);
    const customer = stripeObjectId(initial.customer);
    if (!customer || !/^[A-Za-z0-9_]+$/.test(initial.id)) return;
    const user = await db.collection<User>(Collections.USERS).findOne({ stripeCustomerId: customer });
    const deleted = !user && await db.collection<User>(DELETED_BILLING_ACCOUNTS).findOne({ stripeCustomerId: customer });
    if (!user && !deleted) return;
    async function update(current: User, owner?: string) {
        const invoice = await stripe.invoices.retrieve(invoiceId);
        if (stripeObjectId(invoice.customer) !== current.stripeCustomerId) return;
        const subscriptionId = getInvoiceSubscriptionId(invoice) || 'standalone';
        const existing = current.stripePaymentIssues?.[invoice.id];
        const users = db.collection<User>(deleted ? DELETED_BILLING_ACCOUNTS : Collections.USERS);
        const filter = owner ? billingFence(current, owner) : { _id: current._id, stripeCustomerId: current.stripeCustomerId };
        let result;
        if (invoice.status === 'paid' || invoice.status === 'void' || await isUnpaidPlanOffer(current, invoice, { db, stripe })) {
            result = await users.updateOne(filter, { $unset: { [`stripePaymentIssues.${invoice.id}`]: '' } });
        } else if (invoice.amount_remaining > 0 && (kind !== 'reconcile' || ['open', 'uncollectible'].includes(invoice.status || '') || existing)) {
            result = await users.updateOne(filter, { $set: {
                [`stripePaymentIssues.${invoice.id}`]: { state: kind === 'action_required' ? kind : existing?.state || 'failed', subscriptionId, updatedAt: new Date() },
                ...(invoice.status === 'uncollectible' && !hasBlockingBillingReview(current.billingReview) && current.billingEntitlement?.source !== 'admin'
                    ? { billingReview: { reason: 'uncollectible_invoice', createdAt: new Date() } } : {}),
            } });
        }
        if (result && !result.matchedCount) throw new BillingBusyError();
    }
    if (user) await withBillingLease(db, user.authSubject, update);
    else if (deleted) await update(deleted);
}

/** Discover missed failures instead of reconciling only invoice IDs already observed in webhooks. */
export async function scanOutstandingInvoices(subject: string, dependencies?: BillingDependencies) {
    const runtime = await billingDependencies(dependencies), { db, stripe } = runtime;
    const user = await db.collection<User>(Collections.USERS).findOne({ authSubject: subject })
        || await db.collection<User>(DELETED_BILLING_ACCOUNTS).findOne({ authSubject: subject });
    if (!user?.stripeCustomerId) return;
    const seen = new Set(Object.keys(user.stripePaymentIssues || {}));
    for (const status of ['open', 'uncollectible'] as const) {
        for await (const invoice of stripe.invoices.list({ customer: user.stripeCustomerId, status, limit: 100 })) seen.add(invoice.id);
    }
    for (const id of seen) await syncInvoicePaymentIssue(id, 'reconcile', runtime);
}

import type { Db } from 'mongodb';
import type Stripe from 'stripe';
import type { User } from '@/lib/db/types';
import { Collections } from '@/lib/mongodb';
import { getInvoiceSubscriptionId } from './objects';
import { verifyUsageInvoice } from './invoice-verification';
import { forgetSettledOperatorSubject, hasUnsettledOperatorCosts } from './legacy-operator-costs';
import { CREDIT_NOTE_REVIEWS, scanSubjectCreditNotes } from './credit-notes';
import { scanOutstandingInvoices } from './payment-issues';
import { hasUnsettledProviderCosts } from './provider-costs';
import { INTERNAL_STORAGE_EXPENSES } from '@/lib/integrations/internal-storage-expenses';
import { PROCESSING_BUDGETS } from './legacy-processing-budget';
import { hasBlockingBillingReview } from './financial-review';

export const DELETED_BILLING_ACCOUNTS = 'billing_deleted_accounts';
export interface FinancialSettlement {
    _id: string;
    customerId?: string;
    subscriptionId?: string;
    customerIds?: string[];
    subscriptionIds?: string[];
    createdAt: Date;
    updatedAt: Date;
    state: 'pending' | 'scheduled' | 'review' | 'settled';
    cancelAt?: Date;
    settledAt?: Date;
    lastError?: string;
    nextCheckAt?: Date;
    revision?: number;
}

/** Financial references only: no contact details, credentials, audio or text. */
export function financialAccountSnapshot(user: User): Partial<User> & Pick<User, '_id' | 'authSubject'> {
    const keys = ['_id', 'authSubject', 'planKey', 'billingEntitlement', 'billingCatalogVersion', 'billingUsageCatalogVersion', 'billingUsageTariffs', 'billingGrantTransfer', 'billingUsagePriceRollout', 'billingSchedule', 'billingPaidBasePeriod', 'lifetimePurchase', 'lifetimeUsageSetup', 'stripeMetering',
        'stripeCustomerId', 'stripeSubscriptionId', 'stripePriceId', 'stripeSubscriptionStatus', 'stripeCurrentPeriodStart',
        'stripeCurrentPeriodEnd', 'stripeBasePeriodStart', 'stripeBasePeriodEnd', 'stripePaymentIssues', 'billingAccount', 'billingOperation', 'usageBillingBootstrap', 'stripeCustomerGeneration',
        'billingLastAppliedOperationId', 'transcriptionReceipts', 'transcriptionUsed', 'transcriptionAllocation', 'storageUsed', 'storageAllocation', 'storagePeakUsed',
        'storagePeakPeriodEnd', 'billingReview'] as const;
    const source = user as unknown as Record<string, unknown>;
    const pendingCheckout = user.pendingCheckout ? {
        attemptId: user.pendingCheckout.attemptId, planKey: user.pendingCheckout.planKey, priceId: user.pendingCheckout.priceId,
        phase: user.pendingCheckout.phase, sessionId: user.pendingCheckout.sessionId, createdAt: user.pendingCheckout.createdAt, expiresAt: user.pendingCheckout.expiresAt,
        // Keep only recovery references. Checkout return URLs can contain personal data.
        params: { customer: user.stripeCustomerId, metadata: { authSubject: user.authSubject } },
    } : undefined;
    return { ...Object.fromEntries(keys.filter(key => source[key] !== undefined).map(key => [key, source[key]])), ...(pendingCheckout ? { pendingCheckout } : {}),
        _id: user._id, authSubject: user.authSubject, disabled: true, billingSettings: { allowOverage: false } };
}

/** Must complete before personal erasure. The final CAS cutover is performed
 * after cleanup so callbacks cannot disappear between snapshot and deletion. */
export async function retainFinancialSettlement(user: User, db: Db): Promise<void> {
    const now = new Date();
    await db.collection<FinancialSettlement>('billing_settlements').updateOne({ _id: user.authSubject }, {
        $setOnInsert: { createdAt: now },
        $set: { state: 'pending', ...(user.stripeCustomerId ? { customerId: user.stripeCustomerId } : {}), ...(user.stripeSubscriptionId ? { subscriptionId: user.stripeSubscriptionId } : {}), updatedAt: now, nextCheckAt: now },
        $unset: { settledAt: '' },
        $inc: { revision: 1 },
        $addToSet: { ...(user.stripeCustomerId ? { customerIds: user.stripeCustomerId } : {}), ...(user.stripeSubscriptionId ? { subscriptionIds: user.stripeSubscriptionId } : {}) },
    }, { upsert: true });
    await db.collection<Partial<User>>(DELETED_BILLING_ACCOUNTS).updateOne({ _id: user._id }, { $set: financialAccountSnapshot(user) }, { upsert: true });
}

/** Late owned resources reopen settlement without overwriting a concurrently updated ledger. */
export async function reopenFinancialSettlement(subject: string, customerId: string, subscriptionId: string | undefined, db: Db): Promise<boolean> {
    const active = await db.collection<User>(Collections.USERS).findOne({ authSubject: subject });
    if (active && !active.disabled && !active.softDelete?.isDeleted) return false;
    if (!active && !await db.collection<User>(DELETED_BILLING_ACCOUNTS).findOne({ authSubject: subject })) return false;
    const now = new Date();
    await db.collection<FinancialSettlement>('billing_settlements').updateOne({ _id: subject }, {
        $setOnInsert: { createdAt: now }, $set: { state: 'pending', customerId, ...(subscriptionId ? { subscriptionId } : {}), updatedAt: now, nextCheckAt: now },
        $addToSet: { customerIds: customerId, ...(subscriptionId ? { subscriptionIds: subscriptionId } : {}) }, $unset: { settledAt: '' },
        $inc: { revision: 1 },
    }, { upsert: true });
    return true;
}

/** Close every app-owned route that could create a new charge after erasure. */
async function closePendingCheckouts(stripe: Stripe, customerIds: string[], subject: string, knownIds: Set<string>, db: Db): Promise<boolean> {
    const account = await db.collection<User>(Collections.USERS).findOne({ authSubject: subject })
        || await db.collection<User>(DELETED_BILLING_ACCOUNTS).findOne({ authSubject: subject });
    let pending = false;
    for (const customer of customerIds) for await (const listed of stripe.checkout.sessions.list({ customer, limit: 100 })) {
        if (listed.metadata?.authSubject !== subject && listed.client_reference_id !== subject && listed.id !== account?.pendingCheckout?.sessionId) continue;
        let session = listed;
        if (session.status === 'open') {
            try { session = await stripe.checkout.sessions.expire(session.id, {}, { idempotencyKey: `delete-expire:${session.id}` }); }
            catch { session = await stripe.checkout.sessions.retrieve(session.id); }
        }
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
        if (subscriptionId) knownIds.add(subscriptionId);
        if (session.status === 'expired') continue;
        if (session.status !== 'complete') throw new Error('An app checkout could not be closed before financial settlement.');
        if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') continue;
        const intentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
        if (intentId) {
            let intent = await stripe.paymentIntents.retrieve(intentId);
            if (['requires_payment_method', 'requires_confirmation', 'requires_action', 'requires_capture'].includes(intent.status)) {
                intent = await stripe.paymentIntents.cancel(intent.id, {}, { idempotencyKey: `delete-cancel-payment:${intent.id}` });
            }
            if (intent.status === 'canceled') continue;
        } else if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            if (['canceled', 'incomplete_expired'].includes(subscription.status)) continue;
        }
        pending = true;
    }
    return pending;
}

export function cancellationBoundary(subscription: Stripe.Subscription, now = new Date()): Date {
    const base = subscription.items.data.find(item => item.price.recurring?.usage_type !== 'metered');
    const end = base?.current_period_end ?? subscription.items.data.find(item => item.price.recurring?.usage_type === 'metered')?.current_period_end;
    if (!end || end * 1000 <= now.getTime()) return now;
    return new Date(end * 1000);
}

export async function hasUnsettledUsagePriceOperations(db: Db, subject: string): Promise<boolean> {
    for (const [collection, completed] of [
        ['billing_grant_transfers', ['ready']], ['billing_grant_scope_operations', ['ready']],
        ['billing_usage_price_rollouts', ['applied', 'canceled']],
    ] as const) if (await db.collection(collection).findOne({ authSubject: subject, state: { $nin: completed } })) return true;
    return false;
}

/** Accepted legacy expense operations retain their original settlement path.
 * Physical storage observations create no financial settlement obligation. */
export async function hasUnsettledProcessingExpenses(db: Db, subject: string): Promise<boolean> {
    for await (const row of db.collection<{ subject: string; state: string; children?: Record<string, { state: string }> }>(PROCESSING_BUDGETS).find({ subject })) {
        // The funding ledger/its archived receipts retain unpriced cost proof;
        // a child's immutable original quote must not override later evidence.
        if (row.state !== 'closed' || Object.values(row.children || {}).some(child => child.state === 'reserved' || child.state === 'unknown')) return true;
    }
    return false;
}

async function unsettledPlanChanges(db: Db, subject: string) {
    const account = await db.collection<User>(Collections.USERS).findOne({ authSubject: subject })
        || await db.collection<User>(DELETED_BILLING_ACCOUNTS).findOne({ authSubject: subject });
    const acceptedId = account?.billingOperation && !['quoted', 'applied', 'canceled'].includes(account.billingOperation.state)
        ? account.billingOperation.id : undefined;
    return db.collection<{ _id: string }>('billing_operations').find({ authSubject: subject, $or: [
        { state: { $nin: ['quoted', 'applied', 'canceled'] } },
        { state: 'canceled', cleanupCompletedAt: { $exists: false }, creditReserved: true },
        ...(acceptedId ? [{ _id: acceptedId }] : []),
    ] }).toArray();
}

/** Close optional payment pages through their owning saga, never by treating
 * every standalone invoice as discardable debt. Paid changes retain review. */
async function closeDeletedPlanChanges(db: Db, stripe: Stripe, subject: string) {
    const rows = await unsettledPlanChanges(db, subject);
    if (!rows.length) return;
    const { advancePlanChange } = await import('./plan-change');
    for (const row of rows) await advancePlanChange(row._id, { db, stripe });
}

async function assertAcceptedWorkDrained(db: Db, subject: string): Promise<void> {
    if ((await unsettledPlanChanges(db, subject)).length) throw new Error('Plan-change payments must reconcile before financial settlement.');
    if (await db.collection(CREDIT_NOTE_REVIEWS).findOne({ authSubject: subject, state: 'requires_reconciliation' })) throw new Error('Credit-note principal must reconcile before financial settlement.');
    if (await hasUnsettledUsagePriceOperations(db, subject)) throw new Error('Usage-price and prepaid-credit operations must settle before final invoicing.');
    if (await hasUnsettledOperatorCosts(subject, db)) throw new Error('Accepted operator-funded operations must settle before final invoicing.');
    if (await hasUnsettledProviderCosts(subject, db)) throw new Error('Unknown provider outcomes must reconcile before financial settlement.');
    if (await hasUnsettledProcessingExpenses(db, subject)) throw new Error('Processing budgets and unpriced operating expenses must reconcile before financial settlement.');
    const account = await db.collection<User>(Collections.USERS).findOne({ authSubject: subject })
        || await db.collection<User>(DELETED_BILLING_ACCOUNTS).findOne({ authSubject: subject });
    if (Object.keys(account?.billingAccount?.outbox || {}).length || Object.values(account?.billingAccount?.reservations || {}).some(row => row.state === 'reserved')) throw new Error('Accepted operations must settle before final invoicing.');
    if (await db.collection(Collections.USAGE_EVENTS).findOne({ authSubject: subject, value: { $gt: 0 }, processingStatus: { $ne: 'processed' } })) throw new Error('Usage processing must finish before final invoicing.');
}

/** Retry independently of personal content cleanup, including after deletion. */
export async function processFinancialSettlements(db: Db, stripe: Stripe, limit = 25) {
    const settlements = db.collection<FinancialSettlement>('billing_settlements');
    const result = { scheduled: 0, settled: 0, review: 0 };
    for (const row of await settlements.find({ state: { $ne: 'settled' }, $or: [{ nextCheckAt: { $exists: false } }, { nextCheckAt: { $lte: new Date() } }] }).sort({ updatedAt: 1 }).limit(limit).toArray()) {
        const fence = { _id: row._id, revision: row.revision ?? { $exists: false } };
        try {
            if (await db.collection(Collections.USERS).findOne({ authSubject: row._id, disabled: { $ne: true }, 'softDelete.isDeleted': { $ne: true } })) {
                await settlements.updateOne(fence, { $set: { updatedAt: new Date(), nextCheckAt: new Date(Date.now() + 86400_000) } });
                continue;
            }
            const customerIds = [...new Set([...(row.customerId ? [row.customerId] : []), ...(row.customerIds || [])])];
            const knownIds = new Set([...(row.subscriptionIds || []), ...(row.subscriptionId ? [row.subscriptionId] : [])]);
            const pendingCheckout = await closePendingCheckouts(stripe, customerIds, row._id, knownIds, db);
            await closeDeletedPlanChanges(db, stripe, row._id);
            const subscriptions = new Map<string, Stripe.Subscription>();
            // Discover already-created purchases whose webhooks arrived during
            // erasure; cancel only references owned by this app/account.
            for (const customer of customerIds) for await (const subscription of stripe.subscriptions.list({ customer, status: 'all', limit: 100 })) {
                if (knownIds.has(subscription.id) || subscription.metadata.authSubject === row._id) subscriptions.set(subscription.id, subscription);
            }
            for (const id of knownIds) if (!subscriptions.has(id)) subscriptions.set(id, await stripe.subscriptions.retrieve(id));
            await scanOutstandingInvoices(row._id, { db, stripe });
            await scanSubjectCreditNotes(row._id, { db, stripe });
            let futureBoundary: Date | undefined;
            const immediate: Stripe.Subscription[] = [];
            for (const subscription of subscriptions.values()) {
                if (['canceled', 'incomplete_expired'].includes(subscription.status)) continue;
                const at = cancellationBoundary(subscription);
                if (at.getTime() <= Date.now()) immediate.push(subscription);
                else {
                    if (!subscription.cancel_at || subscription.cancel_at > at.getTime() / 1000) await stripe.subscriptions.update(subscription.id, { cancel_at: Math.floor(at.getTime() / 1000), proration_behavior: 'none' }, { idempotencyKey: `delete-schedule:${row._id}:${subscription.id}:${at.getTime()}` });
                    if (!futureBoundary || at < futureBoundary) futureBoundary = at;
                }
            }
            if (pendingCheckout) throw new Error('A completed checkout payment is still pending; preserve financial reconciliation.');
            try { await assertAcceptedWorkDrained(db, row._id); }
            catch (error) {
                // Scheduled Stripe cancellation can happen before a callback.
                // Keep drafts open until the accepted-work ledger is drained.
                for (const customer of customerIds) for await (const invoice of stripe.invoices.list({ customer, status: 'draft', limit: 100 })) {
                    if (subscriptions.has(getInvoiceSubscriptionId(invoice) || '') && invoice.auto_advance) await stripe.invoices.update(invoice.id, { auto_advance: false });
                }
                throw error;
            }
            for (const subscription of immediate) await stripe.subscriptions.cancel(subscription.id, { invoice_now: true, prorate: false }, { idempotencyKey: `delete-cancel:${row._id}:${subscription.id}` });
            let open = false;
            for (const customer of customerIds) for await (const invoice of stripe.invoices.list({ customer, limit: 100 })) {
                if (!subscriptions.has(getInvoiceSubscriptionId(invoice) || '')) {
                    // Standalone debt belongs to this dedicated customer too.
                    // Retain it for review without finalizing an unknown charge.
                    if (['draft', 'open', 'uncollectible'].includes(invoice.status || '') && invoice.amount_remaining > 0) open = true;
                    continue;
                }
                if (invoice.status === 'draft') await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: true }, { idempotencyKey: `delete-finalize:${invoice.id}` });
                if (invoice.status === 'open' && invoice.collection_method === 'charge_automatically' && !invoice.auto_advance) await stripe.invoices.update(invoice.id, { auto_advance: true });
                if (['open', 'paid', 'uncollectible'].includes(invoice.status || '')) await verifyUsageInvoice(invoice.id, { db, stripe });
                if (['draft', 'open', 'uncollectible'].includes(invoice.status || '')) open = true;
            }
            if (futureBoundary) {
                await settlements.updateOne(fence, { $set: { state: 'scheduled', cancelAt: futureBoundary, updatedAt: new Date(), nextCheckAt: new Date(Math.min(futureBoundary.getTime(), Date.now() + 86400_000)) }, $addToSet: { subscriptionIds: { $each: [...subscriptions.keys()] } } });
                result.scheduled++; continue;
            }
            await assertAcceptedWorkDrained(db, row._id);
            const pending = await db.collection(Collections.USAGE_EVENTS).findOne({ authSubject: row._id, value: { $gt: 0 }, state: { $ne: 'billed' } });
            if (open || pending) throw new Error('Final invoice, usage verification or outstanding debt still needs reconciliation.');
            await settlements.updateOne(fence, { $set: { state: 'settled', settledAt: new Date(), updatedAt: new Date() }, $unset: { lastError: '' } });
            result.settled++;
        } catch (error) {
            await settlements.updateOne(fence, { $set: { state: 'review', updatedAt: new Date(), nextCheckAt: new Date(Date.now() + 5 * 60_000), lastError: error instanceof Error ? error.message : 'Financial settlement failed.' } });
            result.review++;
        }
    }
    const cutoff = new Date(Date.now() - 90 * 86400_000);
    for (const row of await settlements.find({ state: 'settled', settledAt: { $lt: cutoff } }).limit(limit).toArray()) {
        const account = await db.collection<User>(DELETED_BILLING_ACCOUNTS).findOne({ authSubject: row._id });
        if ((await unsettledPlanChanges(db, row._id)).length || await db.collection(CREDIT_NOTE_REVIEWS).findOne({ authSubject: row._id, state: 'requires_reconciliation' }) || account?.billingGrantTransfer || await hasUnsettledUsagePriceOperations(db, row._id) || hasBlockingBillingReview(account?.billingReview) || Object.keys(account?.stripePaymentIssues || {}).length || Object.keys(account?.billingAccount?.outbox || {}).length
            || Object.values(account?.billingAccount?.reservations || {}).some(reservation => reservation.state === 'reserved') || await hasUnsettledOperatorCosts(row._id, db)
            || await hasUnsettledProviderCosts(row._id, db) || await hasUnsettledProcessingExpenses(db, row._id)) {
            await settlements.updateOne({ _id: row._id }, { $set: { state: 'review', nextCheckAt: new Date(), updatedAt: new Date() }, $unset: { settledAt: '' } });
            continue;
        }
        for (const name of ['billing_provider_attempts', 'billing_usage_receipts', 'billing_financial_archive', 'billing_operations', 'billing_prepaid_topups', 'billing_grant_transfers', 'billing_grant_scope_operations', 'billing_usage_price_rollouts', 'billing_subscription_schedules', CREDIT_NOTE_REVIEWS]) await db.collection(name).deleteMany({ authSubject: row._id });
        for (const name of ['ai_cost_receipts', 'billing_provider_cost_evidence', PROCESSING_BUDGETS, INTERNAL_STORAGE_EXPENSES]) await db.collection(name).deleteMany({ subject: row._id });
        await forgetSettledOperatorSubject(row._id, db);
        await db.collection(DELETED_BILLING_ACCOUNTS).deleteOne({ authSubject: row._id });
        await settlements.deleteOne({ _id: row._id, state: 'settled', settledAt: { $lt: cutoff } });
    }
    return result;
}

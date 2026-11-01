import { Collections } from '@/lib/mongodb';
import type Stripe from 'stripe';
import type { User } from '@/lib/db/types';
import { billingEnabled } from '@/lib/config';
import { billingDependencies, type BillingDependencies } from './runtime';
import { checkoutOutcome, findAttemptSessions } from './checkout';
import { applyOneTimeCheckoutPlan, syncSubscription } from './sync';
import { reconcileLifetimeUsage } from './lifetime';
import { stripeObjectId } from './objects';
import { BillingBusyError, billingFence, withBillingLease } from './billing-lock';
import { logger } from '@/lib/logger';
import { scanOutstandingInvoices } from './payment-issues';
import { advancePlanChange, BILLING_OPERATIONS, type BillingChangeOperation } from './plan-change';
import { reconcileUsageTopups, reconcileAutomaticTopup, refreshSubjectUsageTopups } from './prepaid-topup';
import { ensureBillingPeriod } from './ledger';
import { PrepaidFundingRequiredError } from './billing-errors';
import { syncPaidInvoiceFunding } from './invoice-funding';
import { verifyUsageInvoice } from './invoice-verification';
import { hasBlockingFinancialReview, hasBlockingBillingReview } from './financial-review';
import { scanSubjectCreditNotes } from './credit-notes';

/** Account-scoped authoritative preflight immediately before destructive archive retention. */
export async function refreshBillingForPurge(subject: string, dependencies?: BillingDependencies): Promise<{ funded: boolean }> {
    const runtime = await billingDependencies(dependencies), { db, stripe } = runtime;
    let user = await db.collection<User>(Collections.USERS).findOne({ authSubject: subject });
    if (!user?.stripeCustomerId) throw new Error('Billing customer must be verified before archive deletion.');
    if (hasBlockingBillingReview(user.billingReview) || hasBlockingFinancialReview(user.billingAccount)) throw new Error('Resolve billing and cost review before archive deletion.');
    const customer = await stripe.customers.retrieve(user.stripeCustomerId);
    if (customer.deleted) throw new Error('Deleted billing customer needs financial review before archive deletion.');
    const attempt = user.pendingCheckout;
    if (attempt && ['creating', 'open', 'completed'].includes(attempt.phase)) {
        const matches = attempt.sessionId ? [await stripe.checkout.sessions.retrieve(attempt.sessionId)] : await findAttemptSessions(stripe, user.stripeCustomerId, attempt);
        if (matches.length !== 1) throw new Error('Checkout result must be resolved before archive deletion.');
        const session = matches[0], outcome = await checkoutOutcome(stripe, session);
        if (session.status === 'complete' && outcome === 'paid') {
            if (session.mode === 'subscription' && stripeObjectId(session.subscription)) await syncSubscription(stripeObjectId(session.subscription)!, runtime);
            else if (session.mode === 'payment') await applyOneTimeCheckoutPlan(session, runtime);
        } else if (!['failed', 'expired', 'open'].includes(outcome)) throw new Error('Checkout payment is still being confirmed.');
    }
    await refreshSubjectUsageTopups(subject, runtime);
    user = (await db.collection<User>(Collections.USERS).findOne({ authSubject: subject }))!;
    if (user.billingOperation && !['quoted', 'applied', 'canceled'].includes(user.billingOperation.state)) await advancePlanChange(user.billingOperation.id, runtime);
    if (user.stripeSubscriptionId) await syncSubscription(user.stripeSubscriptionId, runtime);
    await scanOutstandingInvoices(subject, runtime);
    await scanSubjectCreditNotes(subject, runtime);
    // Complete pagination includes old subscription and standalone invoices missed by webhooks.
    for await (const invoice of stripe.invoices.list({ customer: user.stripeCustomerId!, limit: 100 })) {
        if (invoice.status === 'paid') {
            await syncPaidInvoiceFunding(invoice.id, runtime);
            await verifyUsageInvoice(invoice.id, runtime);
        }
    }
    user = (await db.collection<User>(Collections.USERS).findOne({ authSubject: subject }))!;
    if (!user) throw new Error('Resolve the billing account before archive deletion.');
    if (hasBlockingBillingReview(user.billingReview) || hasBlockingFinancialReview(user.billingAccount)) throw new Error('Resolve billing and cost review before archive deletion.');
    if (user.billingOperation && !['quoted', 'applied', 'canceled'].includes(user.billingOperation.state)) throw new Error('Resolve the pending plan payment before archive deletion.');
    if (Object.keys(user.stripePaymentIssues || {}).length || user.stripeSubscriptionStatus !== 'active') return { funded: false };
    if (!user.stripeMetering) throw new Error('Verify meter configuration before archive deletion.');
    try { await ensureBillingPeriod(subject, db); return { funded: true }; }
    catch (error) {
        // A known funding refusal authorizes the existing retention clock; infrastructure uncertainty does not.
        if (error instanceof PrepaidFundingRequiredError) return { funded: false };
        throw error;
    }
}

/** Bounded cron repair for missing webhooks, interrupted Checkout, and lifetime setup. */
export async function reconcileBilling(limit = 20, dependencies?: BillingDependencies) {
    const result = { checked: 0, reconciled: 0, failed: 0 };
    if (!billingEnabled()) return result;
    const runtime = await billingDependencies(dependencies);
    const { db, stripe } = runtime;
    const now = new Date();
    const users = db.collection<User>(Collections.USERS);
    const candidates = await users.find({ disabled: { $ne: true }, 'softDelete.isDeleted': { $ne: true },
        $and: [{ $or: [{ billingReview: { $exists: false } }, { 'billingReview.reason': { $in: ['meter_configuration_invalid', 'meter_verification_failed', 'meter_items_mismatch', 'provider_cost_evidence_requires_review'] } }] }],
        $or: [
            { 'pendingCheckout.phase': { $in: ['creating', 'open', 'completed'] }, stripeSyncedAt: { $not: { $gt: new Date(now.getTime() - 5 * 60_000) } } },
            { 'lifetimeUsageSetup.state': { $in: ['pending', 'retrying'] }, 'lifetimeUsageSetup.retryAt': { $lte: now } },
            { stripeSubscriptionId: { $exists: true }, stripeSyncedAt: { $not: { $gt: new Date(now.getTime() - 5 * 60_000) } } },
        ],
    }).sort({ stripeSyncedAt: 1, _id: 1 }).limit(Math.min(Math.max(limit, 1), 100)).toArray();
    for (const user of candidates) {
        result.checked++;
        try {
            const attempt = user.pendingCheckout;
            if (attempt && ['creating', 'open', 'completed'].includes(attempt.phase) && user.stripeCustomerId) {
                let session: Stripe.Checkout.Session | undefined = attempt.sessionId ? await stripe.checkout.sessions.retrieve(attempt.sessionId) : undefined;
                if (!session) {
                    const matches = await findAttemptSessions(stripe, user.stripeCustomerId, attempt);
                    if (matches.length > 1) throw new Error('Multiple checkout sessions match the same attempt.');
                    session = matches[0];
                    if (!session && attempt.expiresAt.getTime() >= now.getTime() + 30 * 60_000) session = await stripe.checkout.sessions.create(attempt.params, { idempotencyKey: `checkout:${attempt.attemptId}` });
                }
                if (!session) {
                    await withBillingLease(db, user.authSubject, async (latest, owner) => {
                        if (latest.pendingCheckout?.attemptId !== attempt.attemptId) return;
                        await users.updateOne(billingFence(latest, owner), { $set: {
                            'pendingCheckout.phase': 'needs_review', billingReview: { reason: 'checkout_result_unknown', createdAt: now }, stripeSyncedAt: now,
                        } });
                    });
                } else if (session.status === 'complete' && !['failed', 'expired'].includes(await checkoutOutcome(stripe, session))) {
                    if (session.mode === 'subscription' && stripeObjectId(session.subscription)) await syncSubscription(stripeObjectId(session.subscription)!, dependencies);
                    if (session.mode === 'payment' && await checkoutOutcome(stripe, session) === 'paid') await applyOneTimeCheckoutPlan(session, dependencies);
                    await users.updateOne({ _id: user._id, 'pendingCheckout.attemptId': attempt.attemptId }, { $set: {
                        'pendingCheckout.phase': 'completed', 'pendingCheckout.sessionId': session.id, stripeSyncedAt: now,
                    } });
                } else {
                    await users.updateOne({ _id: user._id, 'pendingCheckout.attemptId': attempt.attemptId }, { $set: {
                        'pendingCheckout.phase': session.status === 'expired' ? 'expired' : session.status === 'complete' ? 'failed' : 'open',
                        'pendingCheckout.sessionId': session.id, ...(session.url ? { 'pendingCheckout.url': session.url } : {}), stripeSyncedAt: now,
                    } });
                }
            }
            if (user.lifetimeUsageSetup && ['pending', 'retrying'].includes(user.lifetimeUsageSetup.state)) {
                await reconcileLifetimeUsage(user.authSubject, dependencies);
            }
            if (user.stripeSubscriptionId) await syncSubscription(user.stripeSubscriptionId, dependencies);
            // Dependency injection must not disable production debt discovery.
            // Subscription synchronization performs the same complete scans.
            if (!user.stripeSubscriptionId) {
                await scanOutstandingInvoices(user.authSubject, runtime);
                await scanSubjectCreditNotes(user.authSubject, runtime);
            }
            result.reconciled++;
        } catch (error) {
            if (!(error instanceof BillingBusyError)) logger.error('Billing reconciliation failed', { authSubject: user.authSubject, error });
            result.failed++;
        }
    }
    for (const operation of await db.collection<BillingChangeOperation>(BILLING_OPERATIONS).find({ $or: [
        { state: { $in: ['scheduled', 'draining', 'applying', 'awaiting_payment'] } },
        { state: 'canceled', cleanupCompletedAt: { $exists: false } },
    ] })
        .sort({ updatedAt: 1 }).limit(limit).toArray()) {
        try { await advancePlanChange(operation._id, dependencies); }
        catch (error) {
            if (!(error instanceof BillingBusyError)) logger.warn('Billing change remains pending', { operationId: operation._id, error });
            result.failed++;
        }
    }
    await reconcileUsageTopups(limit, dependencies);
    for (const user of await users.find({ 'automaticTopup.enabled': true, disabled: { $ne: true }, 'softDelete.isDeleted': { $ne: true },
        $or: [{ billingReview: { $exists: false } }, { 'billingReview.reason': 'provider_cost_evidence_requires_review' }] }).limit(limit).toArray()) {
        try { await reconcileAutomaticTopup(user.authSubject, dependencies); }
        catch (error) { logger.warn('Automatic usage top-up remains pending', { authSubject: user.authSubject, error }); result.failed++; }
    }
    return result;
}

import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { Collections } from '@/lib/mongodb';
import type { Plan, User } from '@/lib/db/types';
import { ensureStripeCustomerId } from './customer';
import { billingFence, BillingBusyError, withBillingLease } from './billing-lock';
import type { PendingCheckout } from './billing-types';
import { billingDependencies, type BillingDependencies } from './runtime';
import { validateCheckoutPlan } from './metering';
import { stripeObjectId } from './objects';
import { assertPublishedPlan } from './catalog-publication';
import { BILLING_CATALOG } from './catalog';
import { assertCompletePublishedUsageCatalog } from './grant-prices';
import { hasBlockingBillingReview } from './financial-review';

export class CheckoutConflictError extends Error {}
const NONTERMINAL_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']);

/** A completed asynchronous checkout can still be pending. Only irrevocable failure frees the attempt. */
export async function checkoutOutcome(stripe: Stripe, session: Stripe.Checkout.Session): Promise<'open' | 'paid' | 'pending' | 'failed' | 'expired'> {
    if (session.status === 'expired') return 'expired';
    if (session.status === 'open') return 'open';
    if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') return 'paid';
    const intentId = stripeObjectId(session.payment_intent);
    if (session.mode === 'payment' && intentId) {
        const intent = await stripe.paymentIntents.retrieve(intentId);
        if (intent.status === 'canceled') return 'failed';
        if (intent.status === 'requires_payment_method' && intent.last_payment_error) {
            // Prevent a replacement checkout racing a late retry of the failed PaymentIntent.
            const canceled = await stripe.paymentIntents.cancel(intent.id, {}, { idempotencyKey: `failed-checkout:${session.id}` });
            if (canceled.status === 'canceled') return 'failed';
        }
    }
    return 'pending';
}

export async function syncFailedCheckout(sessionId: string, dependencies?: BillingDependencies) {
    const { db, stripe } = await billingDependencies(dependencies);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const outcome = await checkoutOutcome(stripe, session);
    if (outcome !== 'failed' && outcome !== 'expired') return;
    const subject = session.client_reference_id || session.metadata?.authSubject;
    if (!subject) return;
    await withBillingLease(db, subject, async (user, owner) => {
        if (user.stripeCustomerId !== stripeObjectId(session.customer)) return;
        if (!user.pendingCheckout) return;
        if (user.pendingCheckout?.sessionId !== session.id && user.pendingCheckout?.attemptId !== session.metadata?.checkoutAttemptId) return;
        await db.collection<User>(Collections.USERS).updateOne(billingFence(user, owner), { $set: {
            'pendingCheckout.phase': outcome, 'pendingCheckout.sessionId': session.id, updatedAt: new Date(),
        } });
    });
}

/** Paginate: an older live subscription must not disappear behind canceled history. */
export async function customerSubscriptions(stripe: Stripe, customer: string) {
    const all: Stripe.Subscription[] = [];
    let cursor: string | undefined;
    for (;;) {
        const page = await stripe.subscriptions.list({ customer, status: 'all', limit: 100, ...(cursor ? { starting_after: cursor } : {}) });
        all.push(...page.data);
        if (!page.has_more || !page.data.length) return all;
        cursor = page.data.at(-1)!.id;
    }
}

/** Recover remote success after the process died before persisting the session ID. */
export async function findAttemptSessions(stripe: Stripe, customer: string, attempt: PendingCheckout) {
    const matches: Stripe.Checkout.Session[] = [];
    let cursor: string | undefined;
    for (;;) {
        const page = await stripe.checkout.sessions.list({ customer, created: { gte: Math.floor(attempt.createdAt.getTime() / 1000) - 60 }, limit: 100,
            ...(cursor ? { starting_after: cursor } : {}) });
        matches.push(...page.data.filter(session => session.metadata?.checkoutAttemptId === attempt.attemptId));
        if (!page.has_more || !page.data.length) return matches;
        cursor = page.data.at(-1)!.id;
    }
}

export function checkoutParams(user: User, plan: Plan, customer: string, attemptId: string, urls: { success: string; cancel: string }, now: Date): Stripe.Checkout.SessionCreateParams {
    const metadata = { authSubject: user.authSubject, userId: user._id.toString(), selectedPlanKey: plan.key,
        selectedPriceId: plan.stripePriceId, selectedPlanName: plan.name, checkoutAttemptId: attemptId,
        billingCatalogVersion: plan.billingCatalogVersion || '', tariffVersion: BILLING_CATALOG.version,
        storagePriceId: plan.stripeStoragePriceId || '', transcriptionPriceId: plan.stripeTranscriptionPriceId || '' };
    const lifetime = plan.interval === 'lifetime';
    return {
        customer, client_reference_id: user.authSubject, metadata,
        mode: lifetime ? 'payment' : 'subscription',
        // Checkout cannot create a mixed annual-base/monthly-usage subscription.
        // Attach the two monthly meters durably after the base invoice is paid.
        line_items: [{ price: plan.stripePriceId, quantity: 1 }],
        success_url: urls.success, cancel_url: urls.cancel, allow_promotion_codes: false,
        allowed_payment_method_types: ['card'],
        billing_address_collection: 'required', customer_update: { address: 'auto', name: 'auto' }, expires_at: Math.floor(now.getTime() / 1000) + 60 * 60,
        ...(lifetime ? { custom_text: { submit: { message: 'Lifetime access is a one-time purchase. Storage and transcription usage are billed separately on an ongoing basis using your saved payment method.' } } } : {}),
        ...(lifetime ? { invoice_creation: { enabled: true }, payment_intent_data: { setup_future_usage: 'off_session', description: 'VoSift Lifetime platform access; storage and transcription usage billed separately.' } } : { subscription_data: { metadata, billing_mode: { type: 'flexible' } } }),
    };
}

export async function createOrResumeCheckout(subject: string, plan: Plan, urls: { success: string; cancel: string }, dependencies?: BillingDependencies): Promise<string> {
    const { db, stripe } = await billingDependencies(dependencies);
    const published = await assertPublishedPlan(plan, db);
    if (plan.billingCatalogVersion !== published._id) throw new CheckoutConflictError('The published offer changed. Reload pricing before checking out.');
    plan = { ...published.plan, usageTariffs: published.usageTariffs };
    await assertCompletePublishedUsageCatalog(plan, db, stripe);
    return withBillingLease(db, subject, async (user, owner) => {
        const users = db.collection<User>(Collections.USERS);
        if (user.disabled || user.softDelete?.isDeleted || user.teamInvitationPending || user.billingRecovery?.purgingAt) throw new CheckoutConflictError('Account is unavailable while its archive is being removed.');
        if (hasBlockingBillingReview(user.billingReview)) throw new CheckoutConflictError('Billing needs review before another purchase.');
        if (user.lifetimePurchase) throw new CheckoutConflictError('You already own lifetime access. Use billing settings to manage usage payments.');
        const customer = user.stripeCustomerId || await ensureStripeCustomerId(user, dependencies);
        user.stripeCustomerId = customer;
        let attempt = user.pendingCheckout;
        let session: Stripe.Checkout.Session | undefined;
        const awaitingSync = attempt?.phase === 'completed' && (!user.billingEntitlement || ['trial', 'admin'].includes(user.billingEntitlement.source));
        if (attempt && (!['completed', 'expired', 'failed'].includes(attempt.phase) || awaitingSync)) {
            if (attempt.phase === 'needs_review') throw new CheckoutConflictError('The previous checkout needs review before another purchase.');
            const matches = attempt.sessionId ? [await stripe.checkout.sessions.retrieve(attempt.sessionId)] : await findAttemptSessions(stripe, customer, attempt);
            if (matches.length > 1) {
                await users.updateOne(billingFence(user, owner), { $set: { 'pendingCheckout.phase': 'needs_review', billingReview: { reason: 'duplicate_checkout_sessions', createdAt: new Date() } } });
                throw new CheckoutConflictError('Multiple checkout sessions need review.');
            }
            session = matches[0];
            const outcome = session && await checkoutOutcome(stripe, session);
            if (outcome === 'expired' || outcome === 'failed') {
                attempt = undefined;
                session = undefined;
            } else if (session?.status === 'complete') {
                await users.updateOne(billingFence(user, owner), { $set: { 'pendingCheckout.phase': 'completed', 'pendingCheckout.sessionId': session.id } });
                throw new CheckoutConflictError('Your completed payment is being synchronized. Please retry shortly.');
            } else if (attempt.planKey !== plan.key || attempt.priceId !== plan.stripePriceId) {
                throw new CheckoutConflictError('Finish or let the existing checkout expire before choosing another plan.');
            } else if (!session && (Date.now() - attempt.createdAt.getTime() > 23 * 60 * 60_000
                || attempt.expiresAt.getTime() < Date.now() + 30 * 60_000)) {
                await users.updateOne(billingFence(user, owner), { $set: { 'pendingCheckout.phase': 'needs_review', billingReview: { reason: 'checkout_result_unknown', createdAt: new Date() } } });
                throw new CheckoutConflictError('The previous payment result needs review.');
            }
        }
        const subscriptions = (await customerSubscriptions(stripe, customer)).filter(item => NONTERMINAL_STATUSES.has(item.status));
        if (subscriptions.length) throw new CheckoutConflictError('You already have a subscription. Change your plan in Billing & Plans.');
        if (!attempt || ['completed', 'expired', 'failed'].includes(attempt.phase)) {
            await validateCheckoutPlan(stripe, plan);
            const now = new Date();
            const attemptId = randomUUID();
            attempt = { attemptId, planKey: plan.key, priceId: plan.stripePriceId, phase: 'creating',
                params: checkoutParams(user, plan, customer, attemptId, urls, now), createdAt: now, expiresAt: new Date(now.getTime() + 60 * 60_000) };
            const written = await users.updateOne(billingFence(user, owner), { $set: { pendingCheckout: attempt, updatedAt: now } });
            if (!written.matchedCount) throw new BillingBusyError();
        }
        session ||= await stripe.checkout.sessions.create(attempt.params, { idempotencyKey: `checkout:${attempt.attemptId}` });
        if (!session.url || session.status !== 'open') throw new CheckoutConflictError('Checkout is no longer open. Please retry shortly.');
        const written = await users.updateOne({ ...billingFence(user, owner), 'pendingCheckout.attemptId': attempt.attemptId }, {
            $set: { 'pendingCheckout.phase': 'open', 'pendingCheckout.sessionId': session.id, 'pendingCheckout.url': session.url,
                'pendingCheckout.expiresAt': new Date(session.expires_at * 1000), updatedAt: new Date() },
        });
        if (!written.matchedCount) throw new BillingBusyError();
        return session.url;
    });
}

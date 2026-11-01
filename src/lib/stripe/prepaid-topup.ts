import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { Collections } from '@/lib/mongodb';
import type { User } from '@/lib/db/types';
import { billingDependencies, type BillingDependencies } from './runtime';
import { withBillingLease, billingFence, BillingBusyError } from './billing-lock';
import { stripeObjectId } from './objects';
import { ensureStripeCustomerId } from './customer';
import { creditPrepaidFunds, ensureBillingPeriod, getPrepaidState } from './ledger';
import { hasVerifiedMetering, sourcePlanUsableWhileAwaitingPayment, type AutomaticTopupSettings } from './billing-types';
import { verifiedSubscriptionMeters } from './metering';
import { BillingChangeError } from './plan-change';
import { DELETED_BILLING_ACCOUNTS } from './financial-settlement';
import { processorFeeUsdMicros } from './fees';
import { assertArchivedUsageTariff, assertPublishedUsageMapping } from './catalog-publication';
import { resolveApprovedUsageGrantPrices, validateApprovedGrantPrices, type ApprovedUsageMeterPair } from './grant-prices';
import { assertCatalogBillingReady } from './launch-gate';
import { getPublishedCatalogBundle } from './catalog-bundle';
import { GRANT_TRANSFERS, type GrantTransfer, resolveGrantLineage, grantLineageIds, originalGrantForDescendant, handlePlannedGrantExpiry, suspendGrantLineage } from './grant-transfer';
import { assertDedicatedUsageCustomer } from './grant-prices';
import { hasBlockingBillingReview } from './financial-review';

export const PREPAID_TOPUPS = 'billing_prepaid_topups';
export interface PrepaidTopup {
    _id: string; authSubject: string; customerId: string; amountMinor: number; currency: 'usd';
    kind: 'checkout' | 'automatic'; state: 'creating' | 'open' | 'paid' | 'granted' | 'complete' | 'failed' | 'needs_review';
    meterPriceIds: { storage: string; transcription: string }; createdAt: Date; updatedAt: Date;
    approvedMeterPairs?: ApprovedUsageMeterPair[]; grantPriceIds?: string[];
    /** New grants cover only metered usage, including future published Prices. */
    grantScope?: 'metered';
    sessionId?: string; paymentIntentId?: string; creditGrantId?: string; url?: string; lastError?: string;
    fundingCheckedAt?: Date; fundingLastError?: string;
    checkoutParams?: Stripe.Checkout.SessionCreateParams; paymentParams?: Stripe.PaymentIntentCreateParams;
}
const MINIMUM_MINOR = 500, MAXIMUM_MINOR = 100_000;
function checkAmount(value: number) {
    if (!Number.isSafeInteger(value) || value < MINIMUM_MINOR || value > MAXIMUM_MINOR) throw new BillingChangeError('Usage top-ups must be between USD 5 and USD 1,000.', 400);
}
function availableAccount(user: User) {
    if (user.disabled || user.softDelete?.isDeleted || user.teamInvitationPending || hasBlockingBillingReview(user.billingReview) || user.billingRecovery?.purgingAt) throw new BillingChangeError('Usage credit is unavailable while this account needs review or archive removal.', 403);
}
async function pricesForUser(user: User, runtime: BillingDependencies) {
    return resolveApprovedUsageGrantPrices(user, runtime.db, runtime.stripe);
}
async function assertAttemptPaymentMapping(user: User, attempt: PrepaidTopup, runtime: BillingDependencies) {
    await assertPublishedUsageMapping(user, runtime.db, attempt.meterPriceIds);
    await validateApprovedGrantPrices(attempt.approvedMeterPairs, attempt.grantPriceIds, runtime.stripe);
    await assertDedicatedUsageCustomer(user, runtime.db, runtime.stripe);
    for (const pair of attempt.approvedMeterPairs!) {
        const tariffs = pair.tariffs!;
        await assertArchivedUsageTariff(tariffs.storage, runtime.db);
        await assertArchivedUsageTariff(tariffs.transcription, runtime.db);
        if (tariffs.storage.catalogVersion !== tariffs.transcription.catalogVersion) throw new BillingChangeError('The frozen usage-credit catalog requires review.');
        const bundle = await getPublishedCatalogBundle(tariffs.storage.catalogVersion, runtime.db);
        if (!bundle) throw new BillingChangeError('The frozen usage-credit catalog is unavailable.');
        assertCatalogBillingReady(undefined, [pair.ids.storage, pair.ids.transcription], bundle.acceptanceEvidence,
            { catalogVersion: bundle._id, costFingerprint: bundle.costFingerprint, stripeAccountId: bundle.stripeAccountId, livemode: bundle.livemode });
    }
}
export async function createUsageTopup(subject: string, amountMinor: number, urls: { success: string; cancel: string }, dependencies?: BillingDependencies) {
    checkAmount(amountMinor);
    const runtime = await billingDependencies(dependencies), { db, stripe } = runtime;
    return withBillingLease(db, subject, async user => {
        availableAccount(user);
        const customerId = user.stripeCustomerId || await ensureStripeCustomerId(user, runtime);
        user.stripeCustomerId = customerId;
        const attempts = db.collection<PrepaidTopup>(PREPAID_TOPUPS);
        let attempt = await attempts.findOne({ authSubject: subject, kind: 'checkout', state: { $in: ['creating', 'open', 'paid', 'granted'] } });
        if (attempt?.sessionId) {
            const remote = await stripe.checkout.sessions.retrieve(attempt.sessionId);
            if (remote.status === 'open' && remote.url) return { url: remote.url, attemptId: attempt._id };
            if (remote.status === 'complete') throw new BillingChangeError('The previous usage-credit payment is being confirmed.');
            await attempts.updateOne({ _id: attempt._id }, { $set: { state: 'failed', updatedAt: new Date() } });
            attempt = null;
        }
        if (!attempt) {
            const id = randomUUID(), now = new Date();
            const { current: meterPriceIds, pairs: approvedMeterPairs, priceIds: grantPriceIds } = await pricesForUser(user, runtime);
            const params: Stripe.Checkout.SessionCreateParams = { mode: 'payment', customer: customerId, client_reference_id: subject,
                allowed_payment_method_types: ['card'], billing_address_collection: 'required', customer_update: { address: 'auto', name: 'auto' },
                success_url: urls.success, cancel_url: urls.cancel, expires_at: Math.floor(now.getTime() / 1000) + 3600,
                line_items: [{ price_data: { currency: 'usd', unit_amount: amountMinor, product_data: { name: 'VoSift prepaid usage credit' } }, quantity: 1 }],
                metadata: { purpose: 'usage_topup', topupAttemptId: id, authSubject: subject },
                payment_intent_data: { setup_future_usage: 'off_session', description: 'VoSift prepaid storage and transcription usage credit.', metadata: { purpose: 'usage_topup', topupAttemptId: id, authSubject: subject } },
                custom_text: { submit: { message: 'This credit pays only for VoSift storage and processing usage. Automatic top-ups require separate consent in billing settings.' } } };
            attempt = { _id: id, authSubject: subject, customerId, kind: 'checkout', state: 'creating', amountMinor, currency: 'usd', meterPriceIds, approvedMeterPairs, grantPriceIds,
                grantScope: 'metered', createdAt: now, updatedAt: now, checkoutParams: params };
            await attempts.insertOne(attempt);
        }
        if (Date.now() - attempt.createdAt.getTime() > 23 * 60 * 60_000) throw new BillingChangeError('The previous top-up result needs administrator review.');
        // Recover response loss before retrying a remote create.
        let found: Stripe.Checkout.Session | undefined;
        for await (const session of stripe.checkout.sessions.list({ customer: customerId, created: { gte: Math.floor(attempt.createdAt.getTime() / 1000) - 60 }, limit: 100 })) {
            if (session.metadata?.topupAttemptId !== attempt._id) continue;
            if (found) throw new BillingChangeError('Duplicate usage-credit sessions need review.');
            found = session;
        }
        if (!found) await assertAttemptPaymentMapping(user, attempt, runtime);
        const session = found || await stripe.checkout.sessions.create(attempt.checkoutParams!, { idempotencyKey: `usage-topup:${attempt._id}` });
        await attempts.updateOne({ _id: attempt._id }, { $set: { sessionId: session.id, url: session.url || undefined, state: 'open', updatedAt: new Date() } });
        if (!session.url || session.status !== 'open') throw new BillingChangeError('This top-up is already being confirmed.');
        return { url: session.url, attemptId: attempt._id };
    });
}

async function grantPaidAttempt(attempt: PrepaidTopup, runtime: BillingDependencies, initializePeriod = true) {
    const { db, stripe } = runtime;
    await withBillingLease(db, attempt.authSubject, async user => {
        if (user.stripeCustomerId !== attempt.customerId) throw new BillingChangeError('The payment customer changed.');
        const intent = await stripe.paymentIntents.retrieve(attempt.paymentIntentId!, { expand: ['latest_charge.balance_transaction'] });
        const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
        const balance = charge && typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null;
        if (intent.status !== 'succeeded' || intent.amount_received !== attempt.amountMinor || intent.currency !== attempt.currency
            || stripeObjectId(intent.customer) !== attempt.customerId || !charge || !charge.paid || charge.refunded || charge.amount_refunded || charge.disputed
            || (!balance && attempt.grantScope !== 'metered')) {
            throw new BillingChangeError('The usage-credit payment has not been confirmed.');
        }
        let feeMicros: number | undefined;
        if (balance) {
            try { feeMicros = processorFeeUsdMicros(balance); }
            catch (error) { if (attempt.grantScope !== 'metered') throw error; }
        }
        const moved = attempt.creditGrantId && await db.collection<GrantTransfer>(GRANT_TRANSFERS).findOne({ originalGrantId: attempt.creditGrantId });
        if (moved) {
            // A scope replacement moves remote eligibility only. Recognize the
            // original paid lot idempotently; never fund its descendant again.
            const lineage = await resolveGrantLineage(attempt.creditGrantId!, runtime);
            if (lineage.records.some(row => row.authSubject !== attempt.authSubject || row.customerId !== attempt.customerId)) throw new BillingChangeError('Transferred usage credit has a different owner.');
            if (lineage.grantId) {
                const current = await stripe.billing.creditGrants.retrieve(lineage.grantId);
                if (stripeObjectId(current.customer) !== attempt.customerId || current.category !== 'paid' || current.voided_at || current.expires_at) throw new BillingChangeError('The transferred usage-credit grant needs review.');
            }
            await creditPrepaidFunds(attempt.authSubject, { id: `stripe-credit-grant:${attempt.creditGrantId}`, amountMicros: attempt.amountMinor * 10_000,
                source: 'stripe', reference: attempt.creditGrantId!, processorFeeMicros: feeMicros }, db);
            await db.collection<PrepaidTopup>(PREPAID_TOPUPS).updateOne({ _id: attempt._id }, { $set: { state: 'complete', updatedAt: new Date() } });
            return;
        }
        await validateApprovedGrantPrices(attempt.approvedMeterPairs, attempt.grantPriceIds, stripe);
        if (attempt.grantScope === 'metered') await assertDedicatedUsageCustomer(user, db, stripe);
        let priorGrant: Stripe.Billing.CreditGrant | undefined;
        if (!attempt.creditGrantId) for await (const candidate of stripe.billing.creditGrants.list({ customer: attempt.customerId, limit: 100 })) {
            if (candidate.metadata?.topupAttemptId !== attempt._id) continue;
            if (priorGrant) throw new BillingChangeError('Duplicate usage-credit grants need administrator review.');
            priorGrant = candidate;
        }
        const grant = attempt.creditGrantId ? await stripe.billing.creditGrants.retrieve(attempt.creditGrantId)
            : priorGrant || await stripe.billing.creditGrants.create({ customer: attempt.customerId, category: 'paid',
                amount: { type: 'monetary', monetary: { currency: attempt.currency, value: attempt.amountMinor } },
                applicability_config: { scope: attempt.grantScope === 'metered' ? { price_type: 'metered' } : { prices: attempt.grantPriceIds!.map(id => ({ id })) } },
                metadata: { authSubject: attempt.authSubject, topupAttemptId: attempt._id, paymentIntentId: intent.id },
                name: 'VoSift prepaid usage' }, { idempotencyKey: `usage-credit-grant:${attempt._id}` });
        const scope = grant.applicability_config.scope;
        const scopedIds = scope.prices?.map(price => price.id).sort();
        const requiredIds = [...attempt.grantPriceIds!].sort();
        if (stripeObjectId(grant.customer) !== attempt.customerId || grant.category !== 'paid' || grant.amount.monetary?.currency !== attempt.currency
            || grant.amount.monetary?.value !== attempt.amountMinor || grant.voided_at || grant.expires_at
            || (attempt.grantScope === 'metered' ? scope.price_type !== 'metered' || Boolean(scope.prices?.length)
                : Boolean(scope.price_type) || scopedIds?.length !== requiredIds.length || scopedIds.some((id, index) => id !== requiredIds[index]))) {
            throw new BillingChangeError('The usage-credit grant needs review.');
        }
        await db.collection<PrepaidTopup>(PREPAID_TOPUPS).updateOne({ _id: attempt._id }, { $set: { creditGrantId: grant.id, state: 'granted', updatedAt: new Date() } });
        await creditPrepaidFunds(attempt.authSubject, { id: `stripe-credit-grant:${grant.id}`, amountMicros: attempt.amountMinor * 10_000,
            source: 'stripe', reference: grant.id, processorFeeMicros: feeMicros }, db);
        await db.collection<PrepaidTopup>(PREPAID_TOPUPS).updateOne({ _id: attempt._id }, { $set: { state: 'complete', updatedAt: new Date() } });
    });
    const active = await db.collection<User>(Collections.USERS).findOne({ authSubject: attempt.authSubject });
    if (initializePeriod && active && !active.disabled && !active.softDelete?.isDeleted && hasVerifiedMetering(active)) await ensureBillingPeriod(attempt.authSubject, runtime.db, runtime.stripe);
}
export async function confirmUsageTopup(sessionId: string, dependencies?: BillingDependencies): Promise<boolean> {
    const runtime = await billingDependencies(dependencies), { db, stripe } = runtime;
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata?.purpose !== 'usage_topup') return false;
    const attempt = await db.collection<PrepaidTopup>(PREPAID_TOPUPS).findOne({ _id: session.metadata.topupAttemptId });
    if (!attempt || session.client_reference_id !== attempt.authSubject || stripeObjectId(session.customer) !== attempt.customerId) throw new BillingChangeError('Usage-credit checkout identity mismatch.');
    if (attempt.state === 'complete') return true;
    if (session.status !== 'complete' || session.payment_status !== 'paid') return true;
    const lines = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
    if (lines.has_more || lines.data.length !== 1 || lines.data[0].quantity !== 1 || session.amount_total !== attempt.amountMinor || session.currency !== 'usd') throw new BillingChangeError('Usage-credit checkout amount mismatch.');
    const intentId = stripeObjectId(session.payment_intent);
    if (!intentId) throw new BillingChangeError('Usage-credit payment reference missing.');
    attempt.paymentIntentId = intentId;
    await db.collection<PrepaidTopup>(PREPAID_TOPUPS).updateOne({ _id: attempt._id }, { $set: { state: 'paid', sessionId: session.id, paymentIntentId: intentId, updatedAt: new Date() } });
    await grantPaidAttempt(attempt, runtime);
    return true;
}
export async function updateAutomaticTopup(subject: string, settings: Omit<AutomaticTopupSettings, 'updatedAt' | 'consentedAt'>, dependencies?: BillingDependencies) {
    if (settings.enabled) {
        checkAmount(settings.amountMinor);
        if (![settings.thresholdMinor, settings.dailyCapMinor, settings.monthlyCapMinor].every(value => Number.isSafeInteger(value) && value >= 0)
            || settings.thresholdMinor >= settings.amountMinor || settings.dailyCapMinor < settings.amountMinor
            || settings.monthlyCapMinor < settings.dailyCapMinor || settings.monthlyCapMinor > 1_000_000) throw new BillingChangeError('Choose valid top-up thresholds and daily/monthly spending caps.', 400);
    }
    const runtime = await billingDependencies(dependencies);
    await withBillingLease(runtime.db, subject, async (user, owner) => {
        availableAccount(user);
        if (settings.enabled) {
            await pricesForUser(user, runtime);
            if (!user.stripeCustomerId) throw new BillingChangeError('Complete a usage-credit payment before enabling automatic top-ups.');
            const customer = await runtime.stripe.customers.retrieve(user.stripeCustomerId);
            const method = !customer.deleted && stripeObjectId(customer.invoice_settings.default_payment_method);
            const subscription = user.stripeSubscriptionId && await runtime.stripe.subscriptions.retrieve(user.stripeSubscriptionId);
            if (!method && !stripeObjectId(subscription ? subscription.default_payment_method : null)) throw new BillingChangeError('Add a default reusable payment method before enabling automatic top-ups.');
            for (const prior of await runtime.db.collection<PrepaidTopup>(PREPAID_TOPUPS).find({ authSubject: subject, kind: 'automatic', state: 'needs_review' }).toArray()) {
                if (!prior.paymentIntentId || prior.creditGrantId) throw new BillingChangeError('The previous automatic payment needs financial review before automatic top-ups can resume.');
                const intent = await runtime.stripe.paymentIntents.retrieve(prior.paymentIntentId);
                if (stripeObjectId(intent.customer) !== user.stripeCustomerId || ['processing', 'requires_capture', 'succeeded'].includes(intent.status)) {
                    throw new BillingChangeError('The previous automatic payment is still being confirmed. Add credit manually while it is reconciled.');
                }
                if (intent.status !== 'canceled') await runtime.stripe.paymentIntents.cancel(intent.id, {}, { idempotencyKey: `retire-automatic-topup:${prior._id}` });
                await runtime.db.collection<PrepaidTopup>(PREPAID_TOPUPS).updateOne({ _id: prior._id, state: 'needs_review' }, { $set: {
                    state: 'failed', lastError: 'The unpaid attempt was canceled before renewed automatic-payment consent.', updatedAt: new Date(),
                } });
            }
        }
        const result = await runtime.db.collection<User>(Collections.USERS).updateOne(billingFence(user, owner), { $set: { automaticTopup: { ...settings,
            updatedAt: new Date(), ...(settings.enabled ? { consentedAt: new Date() } : {}) } } });
        if (!result.matchedCount) throw new BillingBusyError();
    });
}

/** Explicit settings consent, account lease and durable daily/monthly sums bound every automatic charge. */
async function activeAutomaticTopupSubscription(user: User, runtime: BillingDependencies): Promise<Stripe.Subscription | undefined> {
    if (!hasVerifiedMetering(user) || !user.stripeSubscriptionId || !user.stripeCustomerId || !user.billingUsageTariffs
        || user.stripeMetering?.storagePriceId !== user.billingUsageTariffs.storage.priceId || user.stripeMetering?.transcriptionPriceId !== user.billingUsageTariffs.transcription.priceId
        || user.billingOperation && !sourcePlanUsableWhileAwaitingPayment(user) || user.billingGrantTransfer || Object.keys(user.stripePaymentIssues || {}).length) return;
    const subscription = await runtime.stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    if (stripeObjectId(subscription.customer) !== user.stripeCustomerId || subscription.status !== 'active' || subscription.billing_mode?.type !== 'flexible'
        || subscription.items.has_more || subscription.pause_collection || !verifiedSubscriptionMeters(subscription, {
            storage: user.billingUsageTariffs.storage.priceId, transcription: user.billingUsageTariffs.transcription.priceId,
        })) return;
    return subscription;
}
export async function reconcileAutomaticTopup(subject: string, dependencies?: BillingDependencies) {
    const runtime = await billingDependencies(dependencies), { db, stripe } = runtime;
    let paid: PrepaidTopup | undefined;
    await withBillingLease(db, subject, async user => {
        availableAccount(user);
        const settings = user.automaticTopup;
        if (!settings?.enabled || !settings.consentedAt || !user.stripeCustomerId || getPrepaidState(user).availableMicros >= settings.thresholdMinor * 10_000) return;
        const attempts = db.collection<PrepaidTopup>(PREPAID_TOPUPS);
        if (await attempts.findOne({ authSubject: subject, kind: 'automatic', state: 'needs_review' })) return;
        let attempt = await attempts.findOne({ authSubject: subject, kind: 'automatic', state: { $in: ['creating', 'paid', 'granted'] } });
        if (!attempt) {
            const subscription = await activeAutomaticTopupSubscription(user, runtime);
            if (!subscription) return;
            const { current: meterPriceIds, pairs: approvedMeterPairs, priceIds: grantPriceIds } = await pricesForUser(user, runtime);
            const now = new Date(), dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
            const previous = await attempts.find({ authSubject: subject, kind: 'automatic', createdAt: { $gte: monthStart }, state: { $ne: 'failed' } }).toArray();
            const month = previous.reduce((sum, value) => sum + value.amountMinor, 0);
            const day = previous.filter(value => value.createdAt >= dayStart).reduce((sum, value) => sum + value.amountMinor, 0);
            if (day + settings.amountMinor > settings.dailyCapMinor || month + settings.amountMinor > settings.monthlyCapMinor) return;
            const customer = await stripe.customers.retrieve(user.stripeCustomerId);
            if (customer.deleted) return;
            const paymentMethod = stripeObjectId(customer.invoice_settings.default_payment_method) || stripeObjectId(subscription?.default_payment_method);
            if (!paymentMethod) return;
            const id = randomUUID();
            const params: Stripe.PaymentIntentCreateParams = { amount: settings.amountMinor, currency: 'usd', customer: user.stripeCustomerId,
                payment_method: paymentMethod, off_session: true, confirm: true, description: 'VoSift automatic prepaid storage and transcription usage credit.',
                metadata: { purpose: 'usage_topup', topupAttemptId: id, authSubject: subject } };
            attempt = { _id: id, authSubject: subject, customerId: user.stripeCustomerId, amountMinor: settings.amountMinor, currency: 'usd',
                kind: 'automatic', state: 'creating', meterPriceIds, approvedMeterPairs, grantPriceIds, grantScope: 'metered', paymentParams: params, createdAt: now, updatedAt: now };
            await attempts.insertOne(attempt);
        }
        if (Date.now() - attempt.createdAt.getTime() > 23 * 60 * 60_000 && !attempt.paymentIntentId) {
            await attempts.updateOne({ _id: attempt._id }, { $set: { state: 'needs_review', lastError: 'Payment result unknown', updatedAt: new Date() } }); return;
        }
        let intent: Stripe.PaymentIntent;
        if (!attempt.paymentIntentId) {
            let recovered: Stripe.PaymentIntent | undefined;
            for await (const candidate of stripe.paymentIntents.list({ customer: attempt.customerId,
                created: { gte: Math.floor(attempt.createdAt.getTime() / 1000) - 60 }, limit: 100 })) {
                if (candidate.metadata.topupAttemptId !== attempt._id) continue;
                if (recovered) throw new BillingChangeError('Duplicate automatic payments need review.');
                recovered = candidate;
            }
            if (recovered) attempt.paymentIntentId = recovered.id;
            else {
                // A durable attempt may predate cancellation while no payment
                // was ever sent. Existing intents can settle, but retries must
                // never initiate a new off-session charge after service ended.
                if (!await activeAutomaticTopupSubscription(user, runtime)) {
                    await attempts.updateOne({ _id: attempt._id }, { $set: { state: 'needs_review', lastError: 'Automatic payment was not started because active usage service could not be verified.', updatedAt: new Date() } });
                    return;
                }
                await assertAttemptPaymentMapping(user, attempt, runtime);
            }
        }
        try { intent = attempt.paymentIntentId ? await stripe.paymentIntents.retrieve(attempt.paymentIntentId)
            : await stripe.paymentIntents.create(attempt.paymentParams!, { idempotencyKey: `automatic-usage-topup:${attempt._id}` }); }
        catch (error) {
            const failed = (error as { payment_intent?: Stripe.PaymentIntent }).payment_intent;
            if (failed?.id) {
                await attempts.updateOne({ _id: attempt._id }, { $set: { paymentIntentId: failed.id, state: 'needs_review', lastError: 'Update payment and add credit manually.', updatedAt: new Date() } });
                await db.collection<User>(Collections.USERS).updateOne({ _id: user._id, stripeCustomerId: user.stripeCustomerId }, { $set: { 'automaticTopup.enabled': false } });
            }
            throw error;
        }
        attempt.paymentIntentId = intent.id;
        await attempts.updateOne({ _id: attempt._id }, { $set: { paymentIntentId: intent.id, state: intent.status === 'succeeded' ? 'paid' : 'needs_review', updatedAt: new Date() } });
        if (intent.status === 'succeeded') paid = attempt;
    });
    if (paid) await grantPaidAttempt(paid, runtime);
}
export async function reconcileUsageTopups(limit = 20, dependencies?: BillingDependencies) {
    const runtime = await billingDependencies(dependencies), attempts = runtime.db.collection<PrepaidTopup>(PREPAID_TOPUPS);
    const pending = await attempts.find({ state: { $in: ['creating', 'open', 'paid', 'granted'] } }).sort({ updatedAt: 1 }).limit(limit).toArray();
    for (const attempt of pending) {
        try {
            if (attempt.sessionId) await confirmUsageTopup(attempt.sessionId, runtime);
            else if (attempt.kind === 'checkout') {
                let found: Stripe.Checkout.Session | undefined;
                for await (const session of runtime.stripe.checkout.sessions.list({ customer: attempt.customerId,
                    created: { gte: Math.floor(attempt.createdAt.getTime() / 1000) - 60 }, limit: 100 })) {
                    if (session.metadata?.topupAttemptId !== attempt._id) continue;
                    if (found) throw new BillingChangeError('Duplicate top-up sessions need review.');
                    found = session;
                }
                if (found) {
                    await attempts.updateOne({ _id: attempt._id }, { $set: { sessionId: found.id, updatedAt: new Date() } });
                    await confirmUsageTopup(found.id, runtime);
                }
            }
            else if (attempt.paymentIntentId) await grantPaidAttempt(attempt, runtime);
            else if (attempt.kind === 'automatic') await reconcileAutomaticTopup(attempt.authSubject, runtime);
        } catch { /* The paid receipt remains durable; the next cron retries it. */ }
    }
    // An authentication-required intent can succeed later without another Checkout event.
    for (const attempt of await attempts.find({ kind: 'automatic', state: 'needs_review', paymentIntentId: { $exists: true }, creditGrantId: { $exists: false } })
        .sort({ updatedAt: 1 }).limit(limit).toArray()) {
        try {
            const intent = await runtime.stripe.paymentIntents.retrieve(attempt.paymentIntentId!);
            if (intent.status === 'succeeded') await grantPaidAttempt(attempt, runtime);
            else await attempts.updateOne({ _id: attempt._id }, { $set: { updatedAt: new Date() } });
        } catch { /* Unknown results retain the financial gate; no replacement charge is issued. */ }
    }
    // Successful fulfillment is not permanent proof that the money or grant
    // still exists. Poll completed receipts fairly to recover missed refund,
    // dispute and grant webhooks without creating another payment or credit.
    const completed = await attempts.find({ state: 'complete' }).sort({ fundingCheckedAt: 1, _id: 1 }).limit(Math.min(Math.max(limit, 1), 100)).toArray();
    for (const attempt of completed) {
        try {
            if (!attempt.paymentIntentId || !attempt.creditGrantId) throw new BillingChangeError('The completed usage-credit receipt has incomplete funding references.');
            const intent = await runtime.stripe.paymentIntents.retrieve(attempt.paymentIntentId);
            if (intent.id !== attempt.paymentIntentId || stripeObjectId(intent.customer) !== attempt.customerId || intent.currency !== attempt.currency
                || intent.status !== 'succeeded' || intent.amount_received !== attempt.amountMinor) throw new BillingChangeError('The completed usage-credit payment identity requires review.');
            const chargeId = stripeObjectId(intent.latest_charge);
            if (!chargeId) throw new BillingChangeError('The completed usage-credit payment has no authoritative charge.');
            const charge = await runtime.stripe.charges.retrieve(chargeId);
            if (stripeObjectId(charge.customer) !== attempt.customerId || stripeObjectId(charge.payment_intent) !== attempt.paymentIntentId
                || charge.currency !== attempt.currency || !charge.paid) throw new BillingChangeError('The completed usage-credit charge identity requires review.');
            if (charge.amount_refunded || charge.disputed) await suspendPrepaidForCharge(charge.id, runtime);
            else {
                const lineage = await resolveGrantLineage(attempt.creditGrantId, runtime);
                if (lineage.records.some(row => row.authSubject !== attempt.authSubject || row.customerId !== attempt.customerId)) throw new BillingChangeError('The usage-credit grant lineage has a different owner.');
                // Planned ancestor expiry moves funding rather than reversing
                // cash. Check the current leaf so a voided replacement is also
                // discovered when its grant-update webhook never arrived.
                if (lineage.grantId) {
                    const grant = await runtime.stripe.billing.creditGrants.retrieve(lineage.grantId);
                    if (stripeObjectId(grant.customer) !== attempt.customerId || grant.category !== 'paid' || grant.amount.monetary?.currency !== attempt.currency) throw new BillingChangeError('The completed usage-credit grant identity requires review.');
                    if (grant.voided_at || (grant.expires_at && grant.expires_at <= Date.now() / 1000)) await syncUsageCreditGrant(grant.id, runtime);
                }
            }
            await attempts.updateOne({ _id: attempt._id }, { $set: { fundingCheckedAt: new Date() }, $unset: { fundingLastError: '' } });
        } catch (error) {
            // Rotate failures as well: one unavailable customer must not starve
            // all later receipts. Unknown reads never mint or revoke money.
            await attempts.updateOne({ _id: attempt._id }, { $set: { fundingCheckedAt: new Date(), fundingLastError: error instanceof Error ? error.message : 'Usage-credit funding reconciliation remains uncertain.' } });
        }
    }
}

/** Destructive retention decisions cannot rely on a bounded global cron sweep. */
export async function refreshSubjectUsageTopups(subject: string, dependencies: BillingDependencies): Promise<void> {
    const runtime = await billingDependencies(dependencies), { db, stripe } = runtime;
    const attempts = db.collection<PrepaidTopup>(PREPAID_TOPUPS);
    const rows = await attempts.find({ authSubject: subject }).toArray();
    for (const attempt of rows) {
        if (attempt.state === 'failed') continue;
        if (attempt.paymentIntentId) {
            const payment = await stripe.paymentIntents.retrieve(attempt.paymentIntentId, { expand: ['latest_charge'] });
            const charge = typeof payment.latest_charge === 'object' ? payment.latest_charge : null;
            if (charge?.amount_refunded || charge?.disputed) { await suspendPrepaidForCharge(charge.id, runtime); continue; }
        }
        if (attempt.creditGrantId) {
            const grant = await stripe.billing.creditGrants.retrieve(attempt.creditGrantId);
            if (grant.voided_at || (grant.expires_at && grant.expires_at <= Date.now() / 1000)) {
                await syncUsageCreditGrant(grant.id, runtime); continue;
            }
        }
        if (attempt.state === 'complete') { await grantPaidAttempt(attempt, runtime, false); continue; }
        if (attempt.kind === 'checkout') {
            let session: Stripe.Checkout.Session | undefined = attempt.sessionId ? await stripe.checkout.sessions.retrieve(attempt.sessionId) : undefined;
            if (!session) for await (const candidate of stripe.checkout.sessions.list({ customer: attempt.customerId,
                created: { gte: Math.floor(attempt.createdAt.getTime() / 1000) - 60 }, limit: 100 })) {
                if (candidate.metadata?.topupAttemptId !== attempt._id) continue;
                if (session) throw new BillingChangeError('Duplicate usage-credit payments need review.');
                session = candidate;
            }
            if (!session) throw new BillingChangeError('The usage-credit payment result is unknown.');
            if (session.status === 'complete' && session.payment_status === 'paid') await confirmUsageTopup(session.id, runtime);
            else if (session.status === 'expired') await attempts.updateOne({ _id: attempt._id }, { $set: { state: 'failed', updatedAt: new Date() } });
            else if (session.status !== 'open' || session.payment_status !== 'unpaid') throw new BillingChangeError('A usage-credit payment is still being confirmed.');
        } else {
            let intent: Stripe.PaymentIntent | undefined = attempt.paymentIntentId ? await stripe.paymentIntents.retrieve(attempt.paymentIntentId) : undefined;
            if (!intent) for await (const candidate of stripe.paymentIntents.list({ customer: attempt.customerId,
                created: { gte: Math.floor(attempt.createdAt.getTime() / 1000) - 60 }, limit: 100 })) {
                if (candidate.metadata.topupAttemptId !== attempt._id) continue;
                if (intent) throw new BillingChangeError('Duplicate automatic usage payments need review.');
                intent = candidate;
            }
            if (!intent) throw new BillingChangeError('The automatic usage-payment result is unknown.');
            if (intent.status === 'succeeded') {
                attempt.paymentIntentId = intent.id;
                await grantPaidAttempt(attempt, runtime, false);
            } else if (intent.status === 'processing' || intent.status === 'requires_capture') {
                throw new BillingChangeError('An automatic usage payment is still being confirmed.');
            }
        }
    }
    const user = await db.collection<User>(Collections.USERS).findOne({ authSubject: subject });
    if (!user?.stripeCustomerId) throw new BillingChangeError('The billing customer is unavailable.');
    // A paid grant created during a lost response must have a durable local receipt.
    const known = new Set<string>();
    for (const attempt of await attempts.find({ authSubject: subject }).toArray()) if (attempt.creditGrantId) for (const id of await grantLineageIds(attempt.creditGrantId, runtime)) known.add(id);
    for await (const grant of stripe.billing.creditGrants.list({ customer: user.stripeCustomerId, limit: 100 })) {
        if (grant.category === 'paid' && !grant.voided_at && !known.has(grant.id)) throw new BillingChangeError('An unrecognized paid usage-credit grant needs review.');
    }
}

export async function confirmAutomaticUsageTopup(intentId: string, dependencies?: BillingDependencies) {
    const runtime = await billingDependencies(dependencies);
    const intent = await runtime.stripe.paymentIntents.retrieve(intentId);
    if (intent.metadata.purpose !== 'usage_topup' || !intent.metadata.topupAttemptId) return;
    const attempt = await runtime.db.collection<PrepaidTopup>(PREPAID_TOPUPS).findOne({ _id: intent.metadata.topupAttemptId });
    if (!attempt || attempt.kind !== 'automatic' || attempt.state === 'complete') return;
    if (stripeObjectId(intent.customer) !== attempt.customerId) throw new BillingChangeError('Automatic usage payment identity mismatch.');
    attempt.paymentIntentId = intent.id;
    await runtime.db.collection<PrepaidTopup>(PREPAID_TOPUPS).updateOne({ _id: attempt._id }, { $set: { paymentIntentId: intent.id, updatedAt: new Date() } });
    await grantPaidAttempt(attempt, runtime);
}

/** Reversed cash can never leave spendable provider grants or local prepaid credit behind. */
export async function suspendPrepaidForCharge(chargeId: string, dependencies?: BillingDependencies): Promise<void> {
    const runtime = await billingDependencies(dependencies), { db, stripe } = runtime;
    const charge = await stripe.charges.retrieve(chargeId);
    const intentId = stripeObjectId(charge.payment_intent), customerId = stripeObjectId(charge.customer);
    if (!intentId || !customerId || (!charge.amount_refunded && !charge.disputed)) return;
    const attempt = await db.collection<PrepaidTopup>(PREPAID_TOPUPS).findOne({ customerId, paymentIntentId: intentId });
    if (!attempt) return;
    await withBillingLease(db, attempt.authSubject, async user => {
        const collection = await db.collection<User>(Collections.USERS).findOne({ _id: user._id }) ? Collections.USERS : DELETED_BILLING_ACCOUNTS;
        await db.collection<User>(collection).updateOne({ _id: user._id, stripeCustomerId: customerId }, { $set: {
            billingReview: { reason: 'prepaid_refund_or_dispute', createdAt: new Date() }, updatedAt: new Date(), 'automaticTopup.enabled': false,
        } });
        const ids = new Set<string>();
        if (attempt.creditGrantId) ids.add(attempt.creditGrantId);
        else for await (const grant of stripe.billing.creditGrants.list({ customer: customerId, limit: 100 })) {
            if (grant.metadata?.topupAttemptId === attempt._id) ids.add(grant.id);
        }
        for (const id of ids) {
            await suspendGrantLineage(user, id, `charge-reversal:${charge.id}:${id}`, runtime);
        }
        if (ids.size === 1 && !attempt.creditGrantId) await db.collection<PrepaidTopup>(PREPAID_TOPUPS).updateOne({ _id: attempt._id }, { $set: { creditGrantId: [...ids][0] } });
        await db.collection<PrepaidTopup>(PREPAID_TOPUPS).updateOne({ _id: attempt._id }, { $set: { state: 'needs_review',
            lastError: 'The prepaid payment was refunded or disputed. Unused credit was suspended; consumed usage requires financial review.', updatedAt: new Date() } });
    });
}

/** Dashboard grant expiry/voiding is authoritative and must also remove local spendable credit. */
export async function syncUsageCreditGrant(grantId: string, dependencies?: BillingDependencies) {
    const runtime = await billingDependencies(dependencies), { db, stripe } = runtime;
    const grant = await stripe.billing.creditGrants.retrieve(grantId);
    if (await handlePlannedGrantExpiry(grantId, runtime)) return;
    const customerId = stripeObjectId(grant.customer);
    if (!customerId) return;
    const ancestor = await originalGrantForDescendant(grantId, runtime);
    const attempt = ancestor
        ? await db.collection<PrepaidTopup>(PREPAID_TOPUPS).findOne({ creditGrantId: ancestor.originalGrantId, customerId })
        : grant.metadata?.topupAttemptId ? await db.collection<PrepaidTopup>(PREPAID_TOPUPS).findOne({ _id: grant.metadata.topupAttemptId, customerId }) : null;
    if (!attempt) return;
    if (!grant.voided_at && (!grant.expires_at || grant.expires_at > Date.now() / 1000)) return;
    await withBillingLease(db, attempt.authSubject, async user => {
        const collection = await db.collection<User>(Collections.USERS).findOne({ _id: user._id }) ? Collections.USERS : DELETED_BILLING_ACCOUNTS;
        await suspendGrantLineage(user, ancestor?.originalGrantId || grant.id, `grant-unavailable:${grant.id}`, runtime);
        await db.collection<User>(collection).updateOne({ _id: user._id, stripeCustomerId: attempt.customerId }, { $set: {
            billingReview: { reason: 'prepaid_grant_unavailable', createdAt: new Date() }, updatedAt: new Date(), 'automaticTopup.enabled': false,
        } });
        await db.collection<PrepaidTopup>(PREPAID_TOPUPS).updateOne({ _id: attempt._id }, { $set: { state: 'needs_review',
            lastError: 'The provider usage-credit grant was expired or voided. Unused credit was suspended.', updatedAt: new Date() } });
    });
}

import type Stripe from 'stripe';
import { hasBlockingBillingReview } from './financial-review';
import { Collections } from '@/lib/mongodb';
import type { User } from '@/lib/db/types';
import { env } from '@/lib/env';
import { billingDependencies, type BillingDependencies } from './runtime';
import { billingFence, BillingBusyError, withBillingLease } from './billing-lock';
import { checkoutMayReplaceAdminGrant, type LifetimeUsageSetup } from './billing-types';
import { BillingConfigurationError, validateMeterPrices, verifiedSubscriptionMeters } from './metering';
import { customerSubscriptions } from './checkout';
import { stripeObjectId, subscriptionPeriodEnd, subscriptionPeriodStart, localSubscriptionStatus } from './objects';
import { reportUsage } from './usage';
import { safelyReportExternalServiceIncident } from '@/lib/external-service-incidents';
import { ensureBillingPeriod } from './ledger';
import { syncPaidCheckoutFunding } from './invoice-funding';
import { DELETED_BILLING_ACCOUNTS } from './financial-settlement';
import { findHistoricalCatalogPlan } from './catalog-bundle';
import type { PublishedCatalog } from './catalog-publication';

/** The webhook payload is only a reference. Entitlements require a currently paid remote session. */
export async function applyOneTimeCheckoutPlan(input: Stripe.Checkout.Session, dependencies?: BillingDependencies) {
    if (!env.NEXT_PUBLIC_ENABLE_BILLING) return;
    const { db, stripe } = await billingDependencies(dependencies);
    const session = await stripe.checkout.sessions.retrieve(input.id);
    if (session.mode !== 'payment' || (session.payment_status !== 'paid' && !(session.payment_status === 'no_payment_required' && session.amount_total === 0)) || session.status !== 'complete') return;
    const subject = session.client_reference_id || session.metadata?.authSubject;
    if (!subject) throw new Error('Lifetime purchase has no account reference.');
    const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
    if (items.has_more || items.data.length !== 1 || items.data[0].quantity !== 1) throw new Error('Unexpected lifetime purchase items.');
    const priceId = items.data[0].price?.id;
    if (!priceId) throw new Error('Lifetime purchase has no price.');
    const price = await stripe.prices.retrieve(priceId);
    const historical = await findHistoricalCatalogPlan(priceId, db, session.metadata?.billingCatalogVersion);
    const plan = historical?.plan;
    if (price.type !== 'one_time' || (plan?.interval !== 'lifetime' && session.metadata?.selectedPlanKey !== 'lifetime')) {
        throw new Error('The paid purchase is not a lifetime plan.');
    }
    const catalog = await db.collection<PublishedCatalog>('billing_catalog_versions').findOne({
        _id: session.metadata?.billingCatalogVersion || historical?._id,
        'plan.stripePriceId': priceId, 'plan.interval': 'lifetime',
    });
    if (!catalog?.usageTariffs) throw new BillingConfigurationError('The paid Lifetime purchase requires its published usage tariff before activation.');
    const now = new Date();
    await withBillingLease(db, subject, async (user, owner) => {
        const users = db.collection<User>(await db.collection<User>(Collections.USERS).findOne({ _id: user._id }) ? Collections.USERS : DELETED_BILLING_ACCOUNTS);
        if (!user.stripeCustomerId || stripeObjectId(session.customer) !== user.stripeCustomerId) throw new Error('Purchase customer does not match the account.');
        if (user.lifetimePurchase) {
            if (user.lifetimePurchase.checkoutSessionId !== session.id) await users.updateOne(billingFence(user, owner), {
                $set: { billingReview: { reason: 'duplicate_lifetime_purchase', createdAt: now } },
            });
            return;
        }
        const pendingMatches = Boolean(user.pendingCheckout && (user.pendingCheckout.sessionId === session.id
            || (session.metadata?.checkoutAttemptId && user.pendingCheckout.attemptId === session.metadata.checkoutAttemptId)));
        const preserveAdmin = user.billingEntitlement?.source === 'admin'
            && (!pendingMatches || !checkoutMayReplaceAdminGrant(user, session.metadata?.checkoutAttemptId));
        const setup: LifetimeUsageSetup = {
            state: 'pending', checkoutSessionId: session.id,
            priceIds: { storage: session.metadata?.storagePriceId || plan?.stripeStoragePriceId || '',
                transcription: session.metadata?.transcriptionPriceId || plan?.stripeTranscriptionPriceId || '' },
            retryAt: now, attempts: 0, createdAt: now, updatedAt: now,
        };
        const result = await users.updateOne(billingFence(user, owner), {
            $set: {
                lifetimePurchase: { checkoutSessionId: session.id, purchasedAt: new Date(session.created * 1000),
                    proof: 'checkout',
                    planKey: plan?.key || 'lifetime', priceId, ...(stripeObjectId(session.payment_intent) ? { paymentIntentId: stripeObjectId(session.payment_intent)! } : {}) },
                lifetimeUsageSetup: setup,
                billingUsageTariffs: catalog.usageTariffs,
                billingUsageCatalogVersion: catalog._id,
                ...(!preserveAdmin ? { billingEntitlement: { source: 'lifetime', reference: session.id, grantedAt: now },
                    planKey: plan?.key || 'lifetime', storageAllocation: plan?.limits.storage || 0, transcriptionAllocation: plan?.limits.transcription || 0,
                    stripePriceId: priceId, 'billingSettings.allowOverage': true } : {}),
                ...(!preserveAdmin ? { billingCatalogVersion: catalog._id } : {}),
                ...(pendingMatches ? { 'pendingCheckout.phase': 'completed', 'pendingCheckout.sessionId': session.id } : {}),
                updatedAt: now,
            },
            $unset: { stripeMetering: '' },
        });
        if (!result.matchedCount) throw new BillingBusyError();
    });
    await syncPaidCheckoutFunding(session, dependencies);
    const active = await db.collection<User>(Collections.USERS).findOne({ authSubject: subject });
    if (!active || active.disabled || active.softDelete?.isDeleted) {
        const customerId = stripeObjectId(session.customer);
        if (customerId) {
            const { reopenFinancialSettlement } = await import('./financial-settlement');
            await reopenFinancialSettlement(subject, customerId, undefined, db);
        }
        return;
    }
    await reconcileLifetimeUsage(subject, dependencies);
}

function setupErrorCode(error: unknown): string {
    if (error instanceof BillingConfigurationError) return 'configuration_required';
    const provider = error as { code?: string; type?: string };
    if (['authentication_required', 'card_declined', 'payment_method_unactivated', 'resource_missing'].includes(provider?.code || '')) return 'payment_method_required';
    return 'provider_unavailable';
}

/** Safe to call from the webhook and cron. Only an explicit user action can resume canceled usage billing. */
export async function reconcileLifetimeUsage(subject: string, dependencies?: BillingDependencies, options?: { resume: boolean }) {
    const { db, stripe } = await billingDependencies(dependencies);
    let ready = false;
    await withBillingLease(db, subject, async (user, owner) => {
        if (!user.lifetimePurchase || !user.lifetimeUsageSetup || user.billingEntitlement?.source !== 'lifetime'
            || user.disabled || user.softDelete?.isDeleted || hasBlockingBillingReview(user.billingReview)) return;
        const users = db.collection<User>(Collections.USERS);
        const purchase = user.lifetimePurchase;
        const setup = { ...user.lifetimeUsageSetup };
        const customerId = user.stripeCustomerId;
        if (!customerId) return;
        const now = new Date();
        // Save intent before remote creation, so a crash can be reconciled by purchase metadata.
        const attempt = await users.updateOne(billingFence(user, owner), { $set: {
            'lifetimeUsageSetup.state': 'retrying', 'lifetimeUsageSetup.updatedAt': now,
            'lifetimeUsageSetup.retryAt': new Date(now.getTime() + 5 * 60_000),
        }, $inc: { 'lifetimeUsageSetup.attempts': 1 } });
        if (!attempt.matchedCount) throw new BillingBusyError();
        try {
            const price = await stripe.prices.retrieve(purchase.priceId);
            await validateMeterPrices(stripe, setup.priceIds, price.currency, undefined, 'lifetime', user.billingUsageTariffs, true);
            const subscriptions = await customerSubscriptions(stripe, customerId);
            const matches = subscriptions.filter(sub => sub.metadata.lifetimeCheckoutSessionId === purchase.checkoutSessionId
                || (sub.id === setup.subscriptionId && sub.metadata.authSubject === user.authSubject));
            const live = matches.filter(sub => !['canceled', 'incomplete_expired'].includes(sub.status));
            const otherLive = subscriptions.filter(sub => !matches.includes(sub) && !['canceled', 'incomplete_expired'].includes(sub.status));
            if (live.length > 1 || otherLive.length) {
                await users.updateOne(billingFence(user, owner), { $set: {
                    billingReview: { reason: 'duplicate_subscriptions', createdAt: now },
                    'lifetimeUsageSetup.state': 'needs_action', 'lifetimeUsageSetup.lastErrorCode': 'duplicate_subscriptions',
                }, $unset: { stripeMetering: '' } });
                return;
            }
            let subscription = live[0];
            let generation = setup.generation || 0;
            const changedCustomer = setup.subscriptionParams && setup.subscriptionParams.customer !== customerId;
            if (changedCustomer && !options?.resume) {
                await users.updateOne(billingFence(user, owner), { $set: {
                    'lifetimeUsageSetup.state': 'needs_action', 'lifetimeUsageSetup.lastErrorCode': 'customer_changed_requires_resume',
                }, $unset: { stripeMetering: '' } });
                return;
            }
            if (changedCustomer) { generation++; delete setup.subscriptionParams; delete setup.creationStartedAt; }
            const currentAttempt = matches.filter(sub => Number(sub.metadata.billingGeneration || 0) === generation);
            const restarting = !subscription && currentAttempt.length > 0 && Boolean(options?.resume);
            if (!subscription && currentAttempt.length && !options?.resume) {
                await users.updateOne(billingFence(user, owner), { $set: {
                    stripeSubscriptionStatus: 'canceled', 'lifetimeUsageSetup.state': 'needs_action',
                    'lifetimeUsageSetup.lastErrorCode': 'usage_subscription_canceled',
                }, $unset: { stripeMetering: '' } });
                return;
            }
            if (restarting) generation = Math.max(...matches.map(sub => Number(sub.metadata.billingGeneration || 0))) + 1;
            const customer = await stripe.customers.retrieve(customerId);
            if (customer.deleted) throw new BillingConfigurationError('The payment customer was removed.');
            let paymentMethodId = stripeObjectId(customer.invoice_settings.default_payment_method)
                || stripeObjectId(subscription?.default_payment_method)
                || stripeObjectId(matches.at(-1)?.default_payment_method);
            if (!paymentMethodId && purchase.paymentIntentId) {
                const intent = await stripe.paymentIntents.retrieve(purchase.paymentIntentId);
                const candidate = stripeObjectId(intent.payment_method);
                if (candidate) {
                    const method = await stripe.paymentMethods.retrieve(candidate);
                    // Old purchases without saved-method consent require the customer to add a reusable method.
                    if (stripeObjectId(method.customer) === customerId) paymentMethodId = candidate;
                }
            }
            if (!paymentMethodId) {
                await users.updateOne(billingFence(user, owner), { $set: {
                    'lifetimeUsageSetup.state': 'needs_action', 'lifetimeUsageSetup.lastErrorCode': 'payment_method_required',
                    ...(subscription ? { stripeSubscriptionId: subscription.id, stripeSubscriptionStatus: localSubscriptionStatus(subscription.status),
                        'lifetimeUsageSetup.subscriptionId': subscription.id } : {}),
                }, $unset: { stripeMetering: '' } });
                return;
            }
            const method = await stripe.paymentMethods.retrieve(paymentMethodId);
            if (stripeObjectId(method.customer) !== customerId) throw new BillingConfigurationError('The saved payment method belongs to another customer.');
            if (!subscription) {
                if (!restarting && setup.creationStartedAt && !currentAttempt.length && now.getTime() - setup.creationStartedAt.getTime() > 23 * 60 * 60_000) {
                    await users.updateOne(billingFence(user, owner), { $set: {
                        billingReview: { reason: 'lifetime_setup_result_unknown', createdAt: now },
                        'lifetimeUsageSetup.state': 'needs_action', 'lifetimeUsageSetup.lastErrorCode': 'provider_result_unknown',
                    } });
                    return;
                }
                const params = (!restarting && setup.subscriptionParams) || {
                    customer: customerId, items: [{ price: setup.priceIds.storage }, { price: setup.priceIds.transcription }],
                    billing_mode: { type: 'flexible' as const },
                    default_payment_method: paymentMethodId,
                    metadata: { authSubject: subject, userId: user._id.toString(), selectedPlanKey: purchase.planKey,
                        selectedPriceId: purchase.priceId, lifetimeCheckoutSessionId: purchase.checkoutSessionId, billingGeneration: String(generation) },
                };
                const saved = await users.updateOne(billingFence(user, owner), { $set: { 'lifetimeUsageSetup.generation': generation,
                    'lifetimeUsageSetup.subscriptionParams': params, 'lifetimeUsageSetup.creationStartedAt': restarting ? now : setup.creationStartedAt || now } });
                if (!saved.matchedCount) throw new BillingBusyError();
                subscription = await stripe.subscriptions.create(params, { idempotencyKey: generation ? `lifetime-usage-subscription:${purchase.checkoutSessionId}:${generation}` : `lifetime-usage-subscription:${purchase.checkoutSessionId}` });
            }
            // Do not create another subscription when an existing one needs payment recovery.
            subscription = await stripe.subscriptions.retrieve(subscription.id);
            const proof = verifiedSubscriptionMeters(subscription, setup.priceIds);
            const healthy = subscription.status === 'active' && Boolean(proof);
            const end = subscriptionPeriodEnd(subscription);
            const start = subscriptionPeriodStart(subscription);
            const values: Record<string, unknown> = {
                    stripeSubscriptionId: subscription.id, stripeSubscriptionStatus: localSubscriptionStatus(subscription.status),
                    'lifetimeUsageSetup.subscriptionId': subscription.id,
                    'lifetimeUsageSetup.state': healthy ? 'ready' : 'needs_action',
                    'lifetimeUsageSetup.updatedAt': new Date(), stripeSyncedAt: new Date(),
                    ...(!healthy ? { 'lifetimeUsageSetup.lastErrorCode': proof ? 'subscription_payment_required' : 'meter_items_mismatch' } : {}),
                    ...(end ? { stripeCurrentPeriodEnd: end, storagePeakPeriodEnd: end } : {}),
                    ...(start ? { stripeCurrentPeriodStart: start } : {}),
                    ...(healthy ? { stripeMetering: proof } : {}),
            };
            const remove = healthy ? ['lifetimeUsageSetup.lastErrorCode'] : ['stripeMetering'];
            const write = await users.updateOne(billingFence(user, owner), { $set: values, $unset: Object.fromEntries(remove.map(key => [key, ''])) });
            if (!write.matchedCount) throw new BillingBusyError();
            ready = healthy;
        } catch (error) {
            if (error instanceof BillingBusyError) throw error;
            const code = setupErrorCode(error);
            await users.updateOne(billingFence(user, owner), { $set: {
                'lifetimeUsageSetup.state': code === 'provider_unavailable' ? 'retrying' : 'needs_action',
                'lifetimeUsageSetup.lastErrorCode': code, 'lifetimeUsageSetup.updatedAt': new Date(),
            }, $unset: { stripeMetering: '' } });
            if (!dependencies) await safelyReportExternalServiceIncident({ provider: 'stripe', service: 'Stripe',
                operation: 'create_lifetime_usage_subscription', error, context: { authSubject: subject, sessionId: purchase.checkoutSessionId }, notifyAdmins: true });
        }
    });
    if (ready && !dependencies) {
        await ensureBillingPeriod(subject, db, stripe);
        const user = await db.collection<User>(Collections.USERS).findOne({ authSubject: subject });
        if (user) await reportUsage(subject, 'storage', user.storageUsed || 0);
    }
    return ready;
}

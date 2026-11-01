import type Stripe from 'stripe';
import { Collections } from '@/lib/mongodb';
import type { User } from '@/lib/db/types';
import { env } from '@/lib/env';
import { billingDependencies, type BillingDependencies } from './runtime';
import { billingFence, BillingBusyError, withBillingLease } from './billing-lock';
import { stripeObjectId, localSubscriptionStatus, subscriptionUsagePeriod } from './objects';
import { BillingConfigurationError, validateMeterPrices, verifiedSubscriptionMeters } from './metering';
import { logger } from '@/lib/logger';
import { checkoutMayReplaceAdminGrant, hasVerifiedMetering, sourcePlanUsableWhileAwaitingPayment } from './billing-types';
import { ensureRecurringUsageBilling } from './bootstrap';
import { ensureBillingPeriod } from './ledger';
import { syncPaidInvoiceFunding } from './invoice-funding';
import { DELETED_BILLING_ACCOUNTS } from './financial-settlement';
import { scanOutstandingInvoices } from './payment-issues';
import { usagePricingTier } from './catalog';
import { findHistoricalCatalogPlan } from './catalog-bundle';
import { scanSubjectCreditNotes } from './credit-notes';
import { syncOwnedBillingScheduleBoundary } from './subscription-schedule';
import { hasBlockingBillingReview } from './financial-review';
import { assertCurrentBasePeriodPaid } from './paid-base-service';

export { applyOneTimeCheckoutPlan } from './lifetime';

export function isVerifiedSubscriptionActivation(user: User | null, subscriptionId: string): boolean {
    return Boolean(user && !user.disabled && !user.softDelete?.isDeleted && user.stripeSubscriptionId === subscriptionId && hasVerifiedMetering(user));
}

export function canAdoptSubscription(user: User, subscription: Stripe.Subscription): boolean {
    if (stripeObjectId(subscription.customer) !== user.stripeCustomerId) return false;
    if (user.billingEntitlement?.source === 'admin') return subscription.id === user.stripeSubscriptionId
        || Boolean(subscription.metadata.checkoutAttemptId && user.pendingCheckout?.attemptId === subscription.metadata.checkoutAttemptId);
    if (user.lifetimePurchase) {
        if (Number(subscription.metadata.billingGeneration || 0) !== (user.lifetimeUsageSetup?.generation || 0)) return false;
        if (subscription.id === user.lifetimeUsageSetup?.subscriptionId) return true;
        if (user.stripeSubscriptionId && user.stripeSubscriptionId !== subscription.id
            && !['canceled', 'incomplete_expired'].includes(user.stripeSubscriptionStatus || '')) return false;
        return subscription.metadata.lifetimeCheckoutSessionId === user.lifetimePurchase.checkoutSessionId;
    }
    if (user.stripeSubscriptionId === subscription.id) return true;
    if (user.stripeSubscriptionId && !['canceled', 'incomplete_expired'].includes(user.stripeSubscriptionStatus || '')) return false;
    return subscription.metadata.authSubject === user.authSubject && (
        Boolean(subscription.metadata.checkoutAttemptId && subscription.metadata.checkoutAttemptId === user.pendingCheckout?.attemptId)
        || (!user.pendingCheckout && !user.billingEntitlement?.reference)
    );
}

/** Authoritative current Stripe resources drive state; old payloads never restore an entitlement. */
export async function syncSubscription(subscriptionId: string, dependencies?: BillingDependencies) {
    if (!env.NEXT_PUBLIC_ENABLE_BILLING) return;
    const runtime = await billingDependencies(dependencies), { db, stripe } = runtime;
    let initial = await stripe.subscriptions.retrieve(subscriptionId);
    const customer = stripeObjectId(initial.customer);
    if (!customer) throw new Error('Subscription has no customer.');
    const user = await db.collection<User>(Collections.USERS).findOne({ stripeCustomerId: customer });
    if (!user || user.disabled || user.softDelete?.isDeleted) {
        const retired = user || await db.collection<User>(DELETED_BILLING_ACCOUNTS).findOne({ stripeCustomerId: customer });
        if (!retired) throw new Error('Subscription customer is not linked to a billing account.');
        // Preserve financial reconciliation after erasure; never recreate a personal account.
        const owned = initial.metadata.authSubject === retired.authSubject || initial.id === retired.stripeSubscriptionId;
        if (!owned) throw new Error('The retired account subscription needs ownership review.');
        const base = initial.items.data.find(item => item.price.recurring?.usage_type !== 'metered');
        const period = subscriptionUsagePeriod(initial);
        await db.collection<User>(user ? Collections.USERS : DELETED_BILLING_ACCOUNTS).updateOne({ _id: retired._id, stripeCustomerId: customer }, { $set: {
            stripeSubscriptionId: initial.id, stripeSubscriptionStatus: localSubscriptionStatus(initial.status), stripeSyncedAt: new Date(),
            ...(base ? { stripeBasePeriodStart: new Date(base.current_period_start * 1000), stripeBasePeriodEnd: new Date(base.current_period_end * 1000) } : {}),
            ...(period.start ? { stripeCurrentPeriodStart: period.start } : {}), ...(period.end ? { stripeCurrentPeriodEnd: period.end } : {}),
        }, $unset: { stripeMetering: '' } });
        const { reopenFinancialSettlement } = await import('./financial-settlement');
        await reopenFinancialSettlement(retired.authSubject, customer, initial.id, db);
        const invoiceId = stripeObjectId(initial.latest_invoice);
        if (invoiceId) await syncPaidInvoiceFunding(invoiceId, runtime);
        await scanOutstandingInvoices(retired.authSubject, runtime);
        await scanSubjectCreditNotes(retired.authSubject, runtime);
        return;
    }
    const base = initial.items.data.find(item => item.price.recurring?.usage_type !== 'metered');
    const initialCatalog = base && await findHistoricalCatalogPlan(base.price.id, db, initial.metadata.billingCatalogVersion || user.billingCatalogVersion);
    const initialPlan = initialCatalog ? { ...initialCatalog.plan, usageTariffs: initialCatalog.usageTariffs } : null;
    if (!user.billingOperation && initialPlan && initial.status === 'active' && !initial.items.data.some(item => item.price.recurring?.usage_type === 'metered')
        && canAdoptSubscription(user, initial)) {
        try {
            await ensureRecurringUsageBilling(user.authSubject, subscriptionId, initialPlan, runtime);
            initial = await stripe.subscriptions.retrieve(subscriptionId);
        } catch (error) {
            await db.collection<User>(Collections.USERS).updateOne({ _id: user._id, stripeCustomerId: customer }, { $set: {
                'usageBillingBootstrap.state': 'needs_action', 'usageBillingBootstrap.subscriptionId': subscriptionId,
                'usageBillingBootstrap.lastErrorCode': error instanceof BillingConfigurationError ? 'configuration_required' : 'provider_unavailable',
                'usageBillingBootstrap.updatedAt': new Date(),
            }, $unset: { stripeMetering: '' } });
            throw error;
        }
    }
    await withBillingLease(db, user.authSubject, async (current, owner) => {
        await syncOwnedBillingScheduleBoundary(current, owner, runtime);
        const users = db.collection<User>(Collections.USERS);
        const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price.product'] });
        if (!canAdoptSubscription(current, subscription)) {
            if (!['canceled', 'incomplete_expired'].includes(subscription.status)) await users.updateOne(billingFence(current, owner), {
                $set: { billingReview: { reason: 'unexpected_subscription', createdAt: new Date() }, updatedAt: new Date() },
            });
            return;
        }
        const set: Record<string, unknown> = { stripeSubscriptionId: subscription.id,
            stripeSubscriptionStatus: localSubscriptionStatus(subscription.status), stripeSyncedAt: new Date(), updatedAt: new Date() };
        const unset: Record<string, ''> = { stripeMetering: '' };
        const currentBase = subscription.items.data.find(item => item.price.recurring?.usage_type !== 'metered');
        if (currentBase) {
            set.stripeBasePeriodStart = new Date(currentBase.current_period_start * 1000);
            set.stripeBasePeriodEnd = new Date(currentBase.current_period_end * 1000);
        } else { unset.stripeBasePeriodStart = ''; unset.stripeBasePeriodEnd = ''; }
        const period = subscriptionUsagePeriod(subscription);
        if (period.start) set.stripeCurrentPeriodStart = period.start;
        if (period.end) set.stripeCurrentPeriodEnd = period.end;
        if (current.billingOperation && !['applied', 'canceled'].includes(current.billingOperation.state)) {
            // The operation owns target activation. Preserve the source proof
            // while it drains; a verified unpaid voluntary invoice can leave
            // the original plan usable until payment is confirmed.
            delete unset.stripeMetering;
            if (sourcePlanUsableWhileAwaitingPayment(current) && subscription.status === 'active') {
                try {
                    const pair = current.billingUsageTariffs;
                    if (!pair || subscription.billing_mode?.type !== 'flexible'
                        || current.billingEntitlement?.source === 'subscription' && currentBase?.price.id !== current.stripePriceId) throw new BillingConfigurationError('The original plan changed before upgrade payment.');
                    const ids = { storage: pair.storage.priceId, transcription: pair.transcription.priceId };
                    await validateMeterPrices(stripe, ids, subscription.currency, undefined, usagePricingTier(current), pair, true);
                    const proof = verifiedSubscriptionMeters(subscription, ids);
                    if (!proof || !period.start || !period.end) throw new BillingConfigurationError('The original monthly meters no longer match.');
                    set.stripeMetering = proof;
                    if (['meter_configuration_invalid', 'meter_verification_failed', 'meter_items_mismatch'].includes(current.billingReview?.reason || '')) unset.billingReview = '';
                } catch (error) {
                    if (!hasBlockingBillingReview(current.billingReview)) set.billingReview = { reason: error instanceof BillingConfigurationError ? 'meter_items_mismatch' : 'meter_verification_failed', createdAt: new Date() };
                    logger.warn('Original plan metering verification failed during upgrade payment', { subscriptionId, error });
                }
            }
            await users.updateOne(billingFence(current, owner), { $set: set, $unset: unset }); return;
        }
        if (current.billingEntitlement?.source === 'admin' && !checkoutMayReplaceAdminGrant(current, subscription.metadata.checkoutAttemptId)) {
            await users.updateOne(billingFence(current, owner), { $set: set, $unset: unset }); return;
        }
        if (subscription.status === 'active' && currentBase) {
            const proof = await assertCurrentBasePeriodPaid(subscription, { ...current, stripeSubscriptionId: subscription.id }, runtime);
            if (proof) set.billingPaidBasePeriod = proof;
        }
        const purchasedCatalog = await findHistoricalCatalogPlan(current.lifetimePurchase?.priceId || currentBase?.price.id || '', db,
            current.lifetimePurchase || current.stripeSubscriptionId === subscription.id ? current.billingCatalogVersion || subscription.metadata.billingCatalogVersion
                : subscription.metadata.billingCatalogVersion || current.billingCatalogVersion);
        const plan = purchasedCatalog?.plan;
        if (!plan) set.billingReview = { reason: 'unmapped_subscription_plan', createdAt: new Date() };
        else {
            // A new paid Checkout after terminal cancellation buys the selected
            // catalog. An existing subscription keeps its noticed usage tariff.
            const adoptingSubscription = !current.lifetimePurchase && current.stripeSubscriptionId !== subscription.id;
            const pair = adoptingSubscription ? purchasedCatalog!.usageTariffs : current.billingUsageTariffs || purchasedCatalog!.usageTariffs;
            const ids = { storage: pair.storage.priceId, transcription: pair.transcription.priceId };
            if (subscription.status === 'active') {
                try {
                    if (subscription.billing_mode?.type !== 'flexible') throw new BillingConfigurationError('Flexible billing must be verified.');
                    await validateMeterPrices(stripe, ids, subscription.currency, undefined, usagePricingTier(current), pair, true);
                    const proof = verifiedSubscriptionMeters(subscription, ids);
                    if (!proof || !period.start || !period.end) throw new BillingConfigurationError('Monthly meter items do not match.');
                    // Operator usage updates activate only through the separately noticed monthly rollout.
                    if (adoptingSubscription || !current.billingUsageTariffs) { set.billingUsageTariffs = pair; set.billingUsageCatalogVersion = purchasedCatalog!._id; }
                    set.stripeMetering = proof; delete unset.stripeMetering;
                    if (['meter_configuration_invalid', 'meter_verification_failed', 'meter_items_mismatch'].includes(current.billingReview?.reason || '')) unset.billingReview = '';
                    if (current.lifetimeUsageSetup) { set['lifetimeUsageSetup.state'] = 'ready'; unset['lifetimeUsageSetup.lastErrorCode'] = ''; }
                } catch (error) {
                    if (current.lifetimeUsageSetup) { set['lifetimeUsageSetup.state'] = 'needs_action'; set['lifetimeUsageSetup.lastErrorCode'] = 'configuration_required'; }
                    else if (!hasBlockingBillingReview(current.billingReview)) set.billingReview = { reason: error instanceof BillingConfigurationError ? 'meter_configuration_invalid' : 'meter_verification_failed', createdAt: new Date() };
                    logger.warn('Subscription metering verification failed', { subscriptionId, error });
                }
            } else if (current.lifetimeUsageSetup) {
                set['lifetimeUsageSetup.state'] = 'needs_action'; set['lifetimeUsageSetup.lastErrorCode'] = 'subscription_payment_required';
            }
            if (!current.lifetimePurchase) {
                set.billingEntitlement = { source: 'subscription', reference: subscription.id,
                    grantedAt: current.billingEntitlement?.source === 'subscription' ? current.billingEntitlement.grantedAt : new Date() };
                set.stripePriceId = currentBase?.price.id;
                if (purchasedCatalog) set.billingCatalogVersion = purchasedCatalog._id;
                if (subscription.status === 'active') { set.planKey = plan.key; set.storageAllocation = plan.limits.storage; set.transcriptionAllocation = plan.limits.transcription; }
            }
        }
        const result = await users.updateOne(billingFence(current, owner), { $set: set, $unset: unset });
        if (!result.matchedCount) throw new BillingBusyError();
    });
    const invoiceId = stripeObjectId(initial.latest_invoice);
    if (invoiceId) await syncPaidInvoiceFunding(invoiceId, runtime);
    await scanOutstandingInvoices(user.authSubject, runtime);
    await scanSubjectCreditNotes(user.authSubject, runtime);
    const latest = await db.collection<User>(Collections.USERS).findOne({ _id: user._id });
    if (latest && hasVerifiedMetering(latest) && (!latest.billingOperation || sourcePlanUsableWhileAwaitingPayment(latest))
        && !hasBlockingBillingReview(latest.billingReview) && !Object.keys(latest.stripePaymentIssues || {}).length) {
        await ensureBillingPeriod(user.authSubject, db, stripe);
    }
}

/** A late checkout event cannot relink a deleted or unrelated customer. */
export async function linkCustomerToUser(customerId: string, authSubject: string, dependencies?: BillingDependencies) {
    const { db, stripe } = await billingDependencies(dependencies);
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted || customer.metadata.authSubject !== authSubject) throw new Error('Checkout customer identity does not match.');
    const result = await db.collection<User>(Collections.USERS).updateOne({ authSubject, $or: [
        { stripeCustomerId: customerId }, { stripeCustomerId: { $exists: false } },
    ] }, { $set: { stripeCustomerId: customerId, updatedAt: new Date() } });
    if (!result.matchedCount) {
        if (await db.collection<User>(DELETED_BILLING_ACCOUNTS).findOne({ authSubject, stripeCustomerId: customerId })) return;
        throw new Error('Checkout customer is already linked elsewhere.');
    }
}

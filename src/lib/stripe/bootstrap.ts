import type Stripe from 'stripe';
import { Collections } from '@/lib/mongodb';
import type { Plan, User } from '@/lib/db/types';
import { billingDependencies, type BillingDependencies } from './runtime';
import { billingFence, BillingBusyError, withBillingLease } from './billing-lock';
import { BillingConfigurationError, validateMeterPrices, verifiedSubscriptionMeters } from './metering';
import { stripeObjectId } from './objects';
import { getBillingAccount } from './ledger';
import { ensureUsageGrantScope } from './grant-transfer';

/** Checkout buys the licensed base; this durable step attaches monthly usage after payment. */
export async function ensureRecurringUsageBilling(subject: string, subscriptionId: string, plan: Plan, dependencies?: BillingDependencies): Promise<void> {
    const { db, stripe } = await billingDependencies(dependencies);
    await withBillingLease(db, subject, async (user, owner) => {
        const users = db.collection<User>(Collections.USERS);
        let subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['latest_invoice'] });
        if (stripeObjectId(subscription.customer) !== user.stripeCustomerId || user.disabled || user.softDelete?.isDeleted) return;
        if (subscription.billing_mode?.type !== 'flexible') throw new BillingConfigurationError('Usage billing requires a verified flexible subscription.');
        if (subscription.status !== 'active') return;
        const invoice = typeof subscription.latest_invoice === 'string'
            ? await stripe.invoices.retrieve(subscription.latest_invoice) : subscription.latest_invoice;
        if (!invoice || invoice.status !== 'paid') return;
        const ids = { storage: plan.stripeStoragePriceId || '', transcription: plan.stripeTranscriptionPriceId || '' };
        await validateMeterPrices(stripe, ids, subscription.currency, undefined, 'recurring', plan.usageTariffs, true);
        // A returning owner can retain paid credit scoped to retired prices.
        // Prepare that original funding before enabling the newly purchased meters.
        if (Object.values(getBillingAccount(user).fundingLots).some(lot => lot.kind === 'prepaid'
            && lot.amountMicros - lot.creditedMicros - (lot.revokedMicros || 0) > 0)) {
            await ensureUsageGrantScope(user, [ids.storage, ids.transcription], { db, stripe });
        }
        const meters = subscription.items.data.filter(item => item.price.recurring?.usage_type === 'metered');
        if (meters.length && !verifiedSubscriptionMeters(subscription, ids)) throw new BillingConfigurationError('Unexpected usage items require review.');
        const now = new Date();
        if (!meters.length) {
            const saved = await users.updateOne(billingFence(user, owner), { $set: {
                usageBillingBootstrap: { state: 'pending', subscriptionId, priceIds: ids, attempts: (user.usageBillingBootstrap?.attempts || 0) + 1,
                    createdAt: user.usageBillingBootstrap?.createdAt || now, updatedAt: now },
            } });
            if (!saved.matchedCount) throw new BillingBusyError();
            const params: Stripe.SubscriptionUpdateParams = { items: [{ price: ids.storage }, { price: ids.transcription }],
                proration_behavior: 'none', billing_cycle_anchor: { type: 'unchanged' } };
            subscription = await stripe.subscriptions.update(subscriptionId, params, {
                idempotencyKey: `monthly-meters:${subscriptionId}:${ids.storage}:${ids.transcription}`,
            });
            subscription = await stripe.subscriptions.retrieve(subscriptionId);
        }
        const proof = verifiedSubscriptionMeters(subscription, ids);
        if (!proof) throw new BillingConfigurationError('Monthly usage items have not been verified.');
        const saved = await users.updateOne(billingFence(user, owner), { $set: {
            usageBillingBootstrap: { state: 'ready', subscriptionId, priceIds: ids,
                attempts: (user.usageBillingBootstrap?.attempts || 0) + 1, createdAt: user.usageBillingBootstrap?.createdAt || now, updatedAt: now },
        } });
        if (!saved.matchedCount) throw new BillingBusyError();
    });
}

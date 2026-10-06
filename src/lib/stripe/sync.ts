import { Stripe } from 'stripe';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { User, Plan } from '@/lib/db/types';
import { updateUser } from '@/lib/db/users';
import { getStripe } from '@/lib/stripe';
import { reportUsage } from '@/lib/stripe/usage';
import { isLifetimePlanKey } from '@/lib/plans';
import { safelyReportExternalServiceIncident } from '@/lib/external-service-incidents';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

type SubscriptionStatus = NonNullable<User['stripeSubscriptionStatus']>;

function getBaseSubscriptionItem(subscription: Stripe.Subscription): Stripe.SubscriptionItem | undefined {
    return (
        subscription.items.data.find((item) => item.price.recurring?.usage_type !== 'metered') ??
        subscription.items.data[0]
    );
}

function getCustomerIdFromSubscription(subscription: Stripe.Subscription): string | null {
    if (typeof subscription.customer === 'string') {
        return subscription.customer;
    }

    return subscription.customer?.id ?? null;
}

function getCustomerIdFromCheckoutSession(session: Stripe.Checkout.Session): string | null {
    if (typeof session.customer === 'string') {
        return session.customer;
    }

    return session.customer?.id ?? null;
}

function mapSubscriptionStatus(subscription: Stripe.Subscription): SubscriptionStatus {
    return subscription.status as SubscriptionStatus;
}

function getBasePlanPriceId(subscription: Stripe.Subscription): string | null {
    const baseItem = getBaseSubscriptionItem(subscription);

    return baseItem?.price?.id ?? null;
}

function getPlanKeyFromSubscriptionMetadata(subscription: Stripe.Subscription): string | null {
    const metadata = subscription.metadata as Record<string, string> | null | undefined;
    if (!metadata) return null;

    return metadata.selectedPlanKey || null;
}

function getSubscriptionCurrentPeriodEnd(subscription: Stripe.Subscription): number | null {
    const baseItem = getBaseSubscriptionItem(subscription);
    if (typeof baseItem?.current_period_end === 'number') {
        return baseItem.current_period_end;
    }

    const itemPeriodEnds = subscription.items.data
        .map((item) => item.current_period_end)
        .filter((periodEnd): periodEnd is number => typeof periodEnd === 'number');

    if (itemPeriodEnds.length > 0) {
        return Math.min(...itemPeriodEnds);
    }

    if (typeof subscription.ended_at === 'number') {
        return subscription.ended_at;
    }

    if (typeof subscription.cancel_at === 'number') {
        return subscription.cancel_at;
    }

    if (typeof subscription.canceled_at === 'number') {
        return subscription.canceled_at;
    }

    return null;
}

async function resolveCheckoutPriceId(session: Stripe.Checkout.Session): Promise<string | null> {
    const metadataPrice = session.metadata?.selectedPriceId;
    if (metadataPrice) {
        return metadataPrice;
    }

    const lineItems = await getStripe().checkout.sessions.listLineItems(session.id, { limit: 1 });
    return lineItems.data[0]?.price?.id ?? null;
}

/**
 * Syncs a Stripe Subscription to the MongoDB User document.
 * This is idempotent and can be called from webhooks or the frontend.
 */
export async function syncSubscription(subscriptionId: string) {
    if (!env.NEXT_PUBLIC_ENABLE_BILLING) return;

    let subscription = await getStripe().subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price.product']
    });

    const db = await getMongoDb();
    const customerId = getCustomerIdFromSubscription(subscription);
    if (!customerId) {
        logger.warn(`[Sync] Subscription ${subscriptionId} has no customer ID`);
        return;
    }

    // Find user by Stripe Customer ID
    const user = await db.collection<User>(Collections.USERS).findOne({ stripeCustomerId: customerId });

    if (!user) {
        logger.warn(`[Sync] No user found for Stripe Customer ID: ${customerId}`);
        return;
    }

    const basePriceId = getBasePlanPriceId(subscription);

    // Find Plan details to update limits based on base subscription item.
    let planResolution: 'base_price' | 'metadata' | null = null;
    const planFromBasePrice: Plan | null = basePriceId
        ? await db.collection<Plan>(Collections.PLANS).findOne({ stripePriceId: basePriceId })
        : null;

    let plan: Plan | null = planFromBasePrice;
    if (planFromBasePrice) {
        planResolution = 'base_price';
    }

    // Usage-only subscriptions (e.g. Lifetime metered add-on subscriptions) might not have a non-metered base item
    // that maps cleanly to `plans.stripePriceId`. In that case, fall back to the plan key stored in metadata.
    if (!plan) {
        const metadataPlanKey = getPlanKeyFromSubscriptionMetadata(subscription);
        if (metadataPlanKey) {
            plan = await db.collection<Plan>(Collections.PLANS).findOne({ key: metadataPlanKey });
            if (plan) {
                planResolution = 'metadata';
            }
        }
    }

    // Map Stripe status to our internal status
    const status = mapSubscriptionStatus(subscription);

    // SELF-HEALING: Ensure Plan-required metered items exist
    // If the user upgraded/switched plans in the Portal, they might have lost the separate metered items
    // (depending on how the switch was handled). We explicitly re-add them if missing.
    if (plan && status === 'active') {
        let subscriptionUpdated = false;
        const currentPriceIds = new Set(subscription.items.data.map((item) => item.price.id));

        const requiredPrices = [
            { type: 'storage', id: plan.stripeStoragePriceId },
            { type: 'transcription', id: plan.stripeTranscriptionPriceId }
        ];

        for (const req of requiredPrices) {
            if (req.id) {
                const hasItem = currentPriceIds.has(req.id);
                if (!hasItem) {
                    logger.info(`[Sync] Missing required metered item (${req.type}) for plan ${plan.name}. Adding...`);
                    try {
                        await getStripe().subscriptionItems.create({
                            subscription: subscription.id,
                            price: req.id,
                        });
                        currentPriceIds.add(req.id);
                        subscriptionUpdated = true;
                    } catch (err) {
                        // Ignore 'already exists' errors (race condition with other webhooks)
                        const stripeErr = err as { code?: string; message?: string } | undefined;
                        if (stripeErr?.code !== 'resource_already_exists' && !stripeErr?.message?.includes('already using that Price')) {
                            logger.error(`[Sync] Failed to add missing metered item ${req.id}:`, err);
                        }
                    }
                }
            }
        }

        // Validate: If we added items, we MUST refresh the subscription object
        // ensuring the next block (Enforce Thresholds) sees the new Item IDs.
        if (subscriptionUpdated) {
            subscription = await getStripe().subscriptions.retrieve(subscriptionId, {
                expand: ['items.data.price.product']
            });
        }
    }

    // NOTE: Billing thresholds for Meters API v2 are configured on the Meter itself in the Stripe Dashboard,
    // not on subscription items. The previous code that set `billing_thresholds.amount_total` was incorrect
    // and has been removed. If you need usage-based billing thresholds, configure them on your Meters in Stripe.
    // https://docs.stripe.com/billing/subscriptions/usage-based/advanced

    const currentPeriodEnd = getSubscriptionCurrentPeriodEnd(subscription);

    const updateData: Record<string, unknown> = {
        stripeSubscriptionId: subscription.id,
        stripeSubscriptionStatus: status, // Cast to specific enum if needed
        // 'billingSettings.allowOverage': false, // Removed: Handled efficiently in plan check
        updatedAt: new Date(),
    };
    if (planResolution === 'base_price' && basePriceId) {
        updateData.stripePriceId = basePriceId;
    } else if (plan?.stripePriceId) {
        updateData.stripePriceId = plan.stripePriceId;
    } else if (basePriceId) {
        updateData.stripePriceId = basePriceId;
    }
    if (typeof currentPeriodEnd === 'number') {
        updateData.stripeCurrentPeriodEnd = new Date(currentPeriodEnd * 1000);
    }

    const newPeriodEnd = updateData.stripeCurrentPeriodEnd as Date | undefined;
    const oldPeriodEnd = user.stripeCurrentPeriodEnd ? new Date(user.stripeCurrentPeriodEnd) : null;
    const periodChanged = Boolean(
        newPeriodEnd && (!oldPeriodEnd || newPeriodEnd.getTime() !== oldPeriodEnd.getTime())
    );

    if (periodChanged && newPeriodEnd) {
        updateData.storagePeakPeriodEnd = newPeriodEnd;
    }

    if (plan && status === 'active') {
        updateData.planKey = plan.key;
        updateData.storageAllocation = plan.limits.storage;
        updateData.transcriptionAllocation = plan.limits.transcription;

        // Force enable overage for Lifetime plans (they are purely usage-based)
        // Only do this when switching TO Lifetime. If they are already on it, respect their current setting.
        if (isLifetimePlanKey(plan.key) && user.planKey !== plan.key) {
            updateData['billingSettings.allowOverage'] = true;
        } else {
            // Do not force overwrite if already on Lifetime or other plans
            delete updateData['billingSettings.allowOverage'];
        }
    } else {
        // If not active (e.g. past_due, canceled, unpaid), we might want to flag the user account
        // The access-control logic will handle the "blocking" based on stripeSubscriptionStatus
        if (status !== 'active' && status !== 'canceled') { // 'canceled' might still have period remaining, checked elsewhere
            // For past_due / unpaid, we keep the plan data but the status will block access.
        }
    }

    // Call the existing updateUser to handle the update
    if (periodChanged) {
        // Use the stored counter at update time, including concurrent uploads.
        const db = await getMongoDb();
        await db.collection<User>(Collections.USERS).updateOne({ authSubject: user.authSubject }, [
            { $set: { ...updateData,
                storagePeakUsed: { $cond: [
                    { $eq: ['$stripeCurrentPeriodEnd', newPeriodEnd] },
                    { $ifNull: ['$storagePeakUsed', 0] }, { $ifNull: ['$storageUsed', 0] },
                ] },
                transcriptionUsed: { $cond: [
                    { $eq: ['$stripeCurrentPeriodEnd', newPeriodEnd] },
                    { $ifNull: ['$transcriptionUsed', 0] }, 0,
                ] },
            } },
        ]);
    } else {
        await updateUser(user.authSubject, updateData);
    }

    logger.info(`[Sync] Updated subscription for user ${user.authSubject} (${user.email}) to ${status}`);

    // If a new billing period started, report the current stored bytes so Stripe has a baseline for this period.
    if (periodChanged) {
        await reportUsage(user.authSubject, 'storage', user.storageUsed || 0, {
            identifier: `storage:${user.authSubject}:period-start:${newPeriodEnd?.toISOString() ?? 'unknown'}:${user.storageUsed || 0}`,
        });
    }
}

/**
 * Links a Stripe Customer ID to a auth subject.
 * Called when a Checkout Session is completed.
 */
export async function linkCustomerToUser(stripeCustomerId: string, authSubject: string) {
    await updateUser(authSubject, {
        stripeCustomerId: stripeCustomerId
    });

    logger.info(`[Sync] Linked Customer ${stripeCustomerId} to User ${authSubject}`);
}

/**
 * Applies a one-time (non-subscription) Checkout purchase to the user's plan.
 * Used for lifetime access or other payment-mode checkouts.
 */
export async function applyOneTimeCheckoutPlan(session: Stripe.Checkout.Session) {
    if (!env.NEXT_PUBLIC_ENABLE_BILLING) return;

    const db = await getMongoDb();
    const customerId = getCustomerIdFromCheckoutSession(session);
    const authSubject = session.client_reference_id || session.metadata?.authSubject || null;

    let user: User | null = null;

    if (authSubject) {
        user = await db.collection<User>(Collections.USERS).findOne({ authSubject });
    }

    if (!user && customerId) {
        user = await db.collection<User>(Collections.USERS).findOne({ stripeCustomerId: customerId });
    }

    if (!user) {
        logger.warn(`[Sync] Could not resolve user for one-time checkout session ${session.id}`);
        return;
    }

    const selectedPriceId = await resolveCheckoutPriceId(session);
    if (!selectedPriceId) {
        logger.warn(`[Sync] Missing selected price for one-time checkout session ${session.id}`);
        return;
    }

    const plan = await db.collection<Plan>(Collections.PLANS).findOne({ stripePriceId: selectedPriceId });
    if (!plan) {
        logger.warn(`[Sync] No plan found for one-time checkout price ${selectedPriceId}`);
        return;
    }

    const setData: Record<string, unknown> = {
        planKey: plan.key,
        storageAllocation: plan.limits.storage,
        transcriptionAllocation: plan.limits.transcription,
        stripePriceId: selectedPriceId,
        updatedAt: new Date(),
    };

    if (customerId) {
        setData.stripeCustomerId = customerId;
    }

    let createdLifetimeUsageSubscriptionId: string | null = null;
    let createdLifetimeUsageSubscriptionPeriodEnd: Date | null = null;
    let createdLifetimeUsageSubscriptionStatus: SubscriptionStatus | null = null;

    if (isLifetimePlanKey(plan.key)) {
        setData['billingSettings.allowOverage'] = true;

        if (customerId) {
            const meteredPriceIds = [plan.stripeStoragePriceId, plan.stripeTranscriptionPriceId]
                .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);

            if (meteredPriceIds.length === 0) {
                await safelyReportExternalServiceIncident({
                    provider: 'stripe',
                    service: 'Stripe',
                    operation: 'create_lifetime_usage_subscription',
                    error: new Error('Lifetime plan is missing metered Stripe price IDs. Usage will not be billed.'),
                    context: {
                        userId: user._id.toString(),
                        authSubject: user.authSubject,
                        planKey: plan.key,
                        planId: plan._id.toString(),
                    },
                    notifyAdmins: true,
                });
            } else {
                let paymentMethodId: string | null = null;
                try {
                    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null;
                    if (paymentIntentId) {
                        const paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId, {
                            expand: ['payment_method'],
                        });
                        paymentMethodId = typeof paymentIntent.payment_method === 'string'
                            ? paymentIntent.payment_method
                            : paymentIntent.payment_method?.id ?? null;
                    }
                } catch (error) {
                    logger.warn(`[Sync] Failed to resolve payment method for lifetime checkout session ${session.id}`, error);
                }

                if (paymentMethodId) {
                    try {
                        await getStripe().customers.update(customerId, {
                            invoice_settings: { default_payment_method: paymentMethodId },
                        });
                    } catch (error) {
                        logger.warn(`[Sync] Failed to set default payment method for customer ${customerId}`, error);
                    }
                }

                try {
                    const lifetimeUsageSubscription = await getStripe().subscriptions.create(
                        {
                            customer: customerId,
                            items: meteredPriceIds.map((price) => ({ price })),
                            metadata: {
                                authSubject: user.authSubject,
                                userId: user._id.toString(),
                                selectedPlanKey: plan.key,
                                selectedPlanName: plan.name,
                                selectedPriceId: selectedPriceId,
                            },
                            ...(paymentMethodId ? { default_payment_method: paymentMethodId } : {}),
                        },
                        {
                            idempotencyKey: `lifetime-usage-subscription:${session.id}`,
                        }
                    );

                    createdLifetimeUsageSubscriptionId = lifetimeUsageSubscription.id;
                    createdLifetimeUsageSubscriptionStatus = lifetimeUsageSubscription.status as SubscriptionStatus;
                    const lifetimePeriodEnd = getSubscriptionCurrentPeriodEnd(
                        lifetimeUsageSubscription as unknown as Stripe.Subscription
                    );
                    if (typeof lifetimePeriodEnd === 'number') {
                        createdLifetimeUsageSubscriptionPeriodEnd = new Date(lifetimePeriodEnd * 1000);
                    }
                } catch (error) {
                    await safelyReportExternalServiceIncident({
                        provider: 'stripe',
                        service: 'Stripe',
                        operation: 'create_lifetime_usage_subscription',
                        error,
                        context: {
                            userId: user._id.toString(),
                            authSubject: user.authSubject,
                            planKey: plan.key,
                            customerId,
                            sessionId: session.id,
                        },
                        notifyAdmins: true,
                    });
                }
            }
        }
    }

    // If we created a Stripe subscription (including the Lifetime usage-only subscription), track it so we can
    // react to status updates (past_due/unpaid/canceled) via webhooks.
    if (createdLifetimeUsageSubscriptionId) {
        setData.stripeSubscriptionId = createdLifetimeUsageSubscriptionId;
    }
    if (createdLifetimeUsageSubscriptionStatus) {
        setData.stripeSubscriptionStatus = createdLifetimeUsageSubscriptionStatus;
    } else {
        // For one-time checkouts, we treat the plan as active locally.
        setData.stripeSubscriptionStatus = 'active';
    }
    if (createdLifetimeUsageSubscriptionPeriodEnd) {
        setData.stripeCurrentPeriodEnd = createdLifetimeUsageSubscriptionPeriodEnd;
    }

    await db.collection<User>(Collections.USERS).updateOne(
        { _id: user._id },
        {
            $set: setData,
            $unset: {
                ...(createdLifetimeUsageSubscriptionId ? {} : { stripeSubscriptionId: '' }),
                ...(createdLifetimeUsageSubscriptionPeriodEnd ? {} : { stripeCurrentPeriodEnd: '' }),
            },
        }
    );

    // Seed current storage as baseline meter value for usage-only plans.
    if (isLifetimePlanKey(plan.key)) {
        await reportUsage(user.authSubject, 'storage', user.storageUsed || 0, {
            identifier: `storage:${user.authSubject}:checkout:${session.id}:${user.storageUsed || 0}`,
        });
    }

    logger.info(`[Sync] Applied one-time checkout session ${session.id} to user ${user.authSubject} (${plan.name})`);
}

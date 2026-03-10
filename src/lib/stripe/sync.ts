import { Stripe } from 'stripe';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { User, Plan } from '@/lib/db/types';
import { updateUser } from '@/lib/db/users';
import { stripe } from '@/lib/stripe';
import { reportUsage } from '@/lib/stripe/usage';

type SubscriptionStatus = NonNullable<User['stripeSubscriptionStatus']>;

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
    if (subscription.status === 'active' && subscription.cancel_at_period_end) {
        return 'canceled';
    }

    return subscription.status as SubscriptionStatus;
}

function getBasePlanPriceId(subscription: Stripe.Subscription): string | null {
    const baseItem =
        subscription.items.data.find(
            (item) => item.price.recurring?.usage_type !== 'metered'
        ) ?? subscription.items.data[0];

    return baseItem?.price?.id ?? null;
}

async function resolveCheckoutPriceId(session: Stripe.Checkout.Session): Promise<string | null> {
    const metadataPrice = session.metadata?.selectedPriceId;
    if (metadataPrice) {
        return metadataPrice;
    }

    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
    return lineItems.data[0]?.price?.id ?? null;
}

/**
 * Syncs a Stripe Subscription to the MongoDB User document.
 * This is idempotent and can be called from webhooks or the frontend.
 */
export async function syncSubscription(subscriptionId: string) {
    if (process.env.NEXT_PUBLIC_ENABLE_BILLING === 'false') return;

    let subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price.product']
    });

    const db = await getMongoDb();
    const customerId = getCustomerIdFromSubscription(subscription);
    if (!customerId) {
        console.warn(`[Sync] Subscription ${subscriptionId} has no customer ID`);
        return;
    }

    // Find user by Stripe Customer ID
    const user = await db.collection<User>(Collections.USERS).findOne({ stripeCustomerId: customerId });

    if (!user) {
        console.warn(`[Sync] No user found for Stripe Customer ID: ${customerId}`);
        return;
    }

    const basePriceId = getBasePlanPriceId(subscription);

    // Find Plan details to update limits based on base subscription item.
    const plan = basePriceId
        ? await db.collection<Plan>(Collections.PLANS).findOne({ stripePriceId: basePriceId })
        : null;

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
                    console.log(`[Sync] Missing required metered item (${req.type}) for plan ${plan.name}. Adding...`);
                    try {
                        await stripe.subscriptionItems.create({
                            subscription: subscription.id,
                            price: req.id,
                        });
                        currentPriceIds.add(req.id);
                        subscriptionUpdated = true;
                    } catch (err: any) {
                        // Ignore 'already exists' errors (race condition with other webhooks)
                        if (err?.code !== 'resource_already_exists' && !err?.message?.includes('already using that Price')) {
                            console.error(`[Sync] Failed to add missing metered item ${req.id}:`, err);
                        }
                    }
                }
            }
        }

        // Validate: If we added items, we MUST refresh the subscription object 
        // ensuring the next block (Enforce Thresholds) sees the new Item IDs.
        if (subscriptionUpdated) {
            subscription = await stripe.subscriptions.retrieve(subscriptionId, {
                expand: ['items.data.price.product']
            });
        }
    }

    // NOTE: Billing thresholds for Meters API v2 are configured on the Meter itself in the Stripe Dashboard,
    // not on subscription items. The previous code that set `billing_thresholds.amount_total` was incorrect
    // and has been removed. If you need usage-based billing thresholds, configure them on your Meters in Stripe.
    // https://stripe.com/docs/billing/subscriptions/usage-based/advanced

    const currentPeriodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end;

    const updateData: Record<string, unknown> = {
        stripeSubscriptionId: subscription.id,
        stripeSubscriptionStatus: status, // Cast to specific enum if needed
        // 'billingSettings.allowOverage': false, // Removed: Handled efficiently in plan check
        updatedAt: new Date(),
    };
    if (basePriceId) {
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
        updateData.storagePeakUsed = user.storageUsed || 0;
        updateData.storagePeakPeriodEnd = newPeriodEnd;
    }

    if (plan && status === 'active') {
        updateData.plan = plan.name;
        updateData.storageAllocation = plan.limits.storage;
        updateData.transcriptionAllocation = plan.limits.transcription;

        // Force enable overage for Lifetime plans (they are purely usage-based)
        // Only do this when switching TO Lifetime. If they are already on it, respect their current setting.
        if (plan.name === 'Lifetime' && user.plan !== 'Lifetime') {
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
    await updateUser(user.firebaseUid, updateData);

    console.log(`[Sync] Updated subscription for user ${user.firebaseUid} (${user.email}) to ${status}`);

    // If a new billing period started, report the current stored bytes so Stripe has a baseline for this period.
    if (periodChanged) {
        await reportUsage(user.firebaseUid, 'storage', user.storageUsed || 0);
    }
}

/**
 * Links a Stripe Customer ID to a Firebase User ID.
 * Called when a Checkout Session is completed.
 */
export async function linkCustomerToUser(stripeCustomerId: string, firebaseUid: string) {
    await updateUser(firebaseUid, {
        stripeCustomerId: stripeCustomerId
    });

    console.log(`[Sync] Linked Customer ${stripeCustomerId} to User ${firebaseUid}`);
}

/**
 * Applies a one-time (non-subscription) Checkout purchase to the user's plan.
 * Used for lifetime access or other payment-mode checkouts.
 */
export async function applyOneTimeCheckoutPlan(session: Stripe.Checkout.Session) {
    if (process.env.NEXT_PUBLIC_ENABLE_BILLING === 'false') return;

    const db = await getMongoDb();
    const customerId = getCustomerIdFromCheckoutSession(session);
    const firebaseUid = session.client_reference_id || session.metadata?.firebaseUid || null;

    let user: User | null = null;

    if (firebaseUid) {
        user = await db.collection<User>(Collections.USERS).findOne({ firebaseUid });
    }

    if (!user && customerId) {
        user = await db.collection<User>(Collections.USERS).findOne({ stripeCustomerId: customerId });
    }

    if (!user) {
        console.warn(`[Sync] Could not resolve user for one-time checkout session ${session.id}`);
        return;
    }

    const selectedPriceId = await resolveCheckoutPriceId(session);
    if (!selectedPriceId) {
        console.warn(`[Sync] Missing selected price for one-time checkout session ${session.id}`);
        return;
    }

    const plan = await db.collection<Plan>(Collections.PLANS).findOne({ stripePriceId: selectedPriceId });
    if (!plan) {
        console.warn(`[Sync] No plan found for one-time checkout price ${selectedPriceId}`);
        return;
    }

    const setData: Record<string, unknown> = {
        plan: plan.name,
        storageAllocation: plan.limits.storage,
        transcriptionAllocation: plan.limits.transcription,
        stripePriceId: selectedPriceId,
        stripeSubscriptionStatus: 'active',
        updatedAt: new Date(),
    };

    if (customerId) {
        setData.stripeCustomerId = customerId;
    }

    if (plan.name === 'Lifetime') {
        setData['billingSettings.allowOverage'] = true;
    }

    await db.collection<User>(Collections.USERS).updateOne(
        { _id: user._id },
        {
            $set: setData,
            $unset: {
                stripeSubscriptionId: '',
                stripeCurrentPeriodEnd: '',
            },
        }
    );

    // Seed current storage as baseline meter value for usage-only plans.
    if (plan.name === 'Lifetime') {
        await reportUsage(user.firebaseUid, 'storage', user.storageUsed || 0);
    }

    console.log(`[Sync] Applied one-time checkout session ${session.id} to user ${user.firebaseUid} (${plan.name})`);
}

import { Stripe } from 'stripe';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { User, Plan } from '@/lib/db/types';
import { updateUser } from '@/lib/db/users';
import { stripe } from '@/lib/stripe';

/**
 * Syncs a Stripe Subscription to the MongoDB User document.
 * This is idempotent and can be called from webhooks or the frontend.
 */
export async function syncSubscription(subscriptionId: string) {
    if (process.env.NEXT_PUBLIC_ENABLE_BILLING === 'false') return;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price.product']
    });

    const db = await getMongoDb();
    const customerId = subscription.customer as string;

    // Find user by Stripe Customer ID
    const user = await db.collection<User>(Collections.USERS).findOne({ stripeCustomerId: customerId });

    if (!user) {
        console.warn(`[Sync] No user found for Stripe Customer ID: ${customerId}`);
        return;
    }

    const price = subscription.items.data[0].price;
    const stripePriceId = price.id;

    // Find Plan details to update limits
    // Note: The Price object itself has limited metadata, ideally we look up our internal Plan definition
    const plan = await db.collection<Plan>(Collections.PLANS).findOne({ stripePriceId: stripePriceId });

    // Map Stripe status to our internal status
    let status = subscription.status;
    if (subscription.status === 'active' && subscription.cancel_at_period_end) {
        status = 'canceled';
    }

    // SELF-HEALING: Ensure Plan-required metered items exist
    // If the user upgraded/switched plans in the Portal, they might have lost the separate metered items
    // (depending on how the switch was handled). We explicitly re-add them if missing.
    if (plan && status === 'active') {
        let subscriptionUpdated = false;

        const requiredPrices = [
            { type: 'storage', id: plan.stripeStoragePriceId },
            { type: 'transcription', id: plan.stripeTranscriptionPriceId }
        ];

        for (const req of requiredPrices) {
            if (req.id) {
                // Always refresh before checking to get latest state (other webhooks may have already added items)
                const currentItems = (await stripe.subscriptions.retrieve(subscriptionId)).items.data;
                const hasItem = currentItems.some(i => i.price.id === req.id);
                if (!hasItem) {
                    console.log(`[Sync] Missing required metered item (${req.type}) for plan ${plan.name}. Adding...`);
                    try {
                        await stripe.subscriptionItems.create({
                            subscription: subscription.id,
                            price: req.id,
                        });
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
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const refreshedSub = await stripe.subscriptions.retrieve(subscriptionId, {
                expand: ['items.data.price.product']
            });
            // Update the local reference for the next block (reassigning properties to keep 'const subscription' valid reference if it was let, but it is const)
            // ERROR: 'subscription' is const. I need to handle this.
            // Workaround: I will just use 'refreshedSub' for the items iteration below if updated.
            // Actually, I can just mutate the array if I want, or better:
            // Since 'subscription' is const, I cannot reassign it.
            // I will update the 'items' property of the object if TS allows, or just use refreshedSub.items.
            subscription.items = refreshedSub.items;
        }
    }

    // NOTE: Billing thresholds for Meters API v2 are configured on the Meter itself in the Stripe Dashboard,
    // not on subscription items. The previous code that set `billing_thresholds.amount_total` was incorrect
    // and has been removed. If you need usage-based billing thresholds, configure them on your Meters in Stripe.
    // https://stripe.com/docs/billing/subscriptions/usage-based/advanced

    const updateData: any = {
        stripeSubscriptionId: subscription.id,
        stripeSubscriptionStatus: status, // Cast to specific enum if needed
        stripePriceId: price.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stripeCurrentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
        // 'billingSettings.allowOverage': false, // Removed: Handled efficiently in plan check
        updatedAt: new Date(),
    };

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

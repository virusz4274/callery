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
                const hasItem = subscription.items.data.some(i => i.price.id === req.id);
                if (!hasItem) {
                    console.log(`[Sync] Missing required metered item (${req.type}) for plan ${plan.name}. Adding...`);
                    try {
                        await stripe.subscriptionItems.create({
                            subscription: subscription.id,
                            price: req.id,
                        });
                        subscriptionUpdated = true;
                    } catch (err) {
                        console.error(`[Sync] Failed to add missing metered item ${req.id}:`, err);
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

    // ENFORCE BILLING THRESHOLDS
    // We want to charge users automatically if their metered usage exceeds a certain amount (e.g., $10).
    // This requires setting `billing_thresholds` on the Subscription Item.
    if (plan && status === 'active') {
        const thresholdAmountCents = 1000; // $10.00

        for (const item of subscription.items.data) {
            const priceId = item.price.id;
            const isMetered = item.price.recurring?.usage_type === 'metered';

            if (isMetered && (priceId === plan.stripeStoragePriceId || priceId === plan.stripeTranscriptionPriceId)) {
                // Check if threshold is already set to avoid unnecessary API calls
                // Note: Stripe API returns null if not set.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const thresholds = item.billing_thresholds as any;
                if (!thresholds || thresholds.amount_total !== thresholdAmountCents) {
                    try {
                        console.log(`[Sync] Setting billing threshold to $${thresholdAmountCents / 100} for item ${item.id} (${priceId})`);
                        await stripe.subscriptionItems.update(item.id, {
                            billing_thresholds: {
                                amount_total: thresholdAmountCents
                            }
                        } as any);
                    } catch (err) {
                        console.error(`[Sync] Failed to set billing threshold for item ${item.id}:`, err);
                    }
                }
            }
        }
    }

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
        if (plan.name === 'Lifetime') {
            updateData['billingSettings.allowOverage'] = true;
        } else {
            // Do not reset allowOverage logic here, strictly managed by user settings unless critical
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

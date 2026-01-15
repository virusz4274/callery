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
        status = 'canceled'; // UI often treats 'canceling' as 'active' until end of period, but we store specific status if needed.
        // The User type has 'stripeSubscriptionStatus' which matches Stripe's enum usually.
        // We'll keep it as Stripe status, but maybe handling 'cancel_at_period_end' separately?
        // User type has `stripeSubscriptionStatus` which allows 'active' | 'canceled' | ...
        // We will store the raw status and rely on `stripeCurrentPeriodEnd` for access control.
    }

    const updateData: any = {
        stripeSubscriptionId: subscription.id,
        stripeSubscriptionStatus: status, // Cast to specific enum if needed
        stripePriceId: price.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stripeCurrentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
        'billingSettings.allowOverage': false, // Default, logic might vary
        updatedAt: new Date(),
    };

    if (plan && status === 'active') {
        updateData.plan = plan.name;
        updateData.storageAllocation = plan.limits.storage;
        updateData.transcriptionAllocation = plan.limits.transcription;
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

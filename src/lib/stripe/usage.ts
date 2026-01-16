
import { stripe } from '@/lib/stripe';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { User, Plan } from '@/lib/db/types';

/**
 * Reports metered usage to Stripe for a specific user.
 */
export async function reportUsage(
    firebaseUid: string,
    type: 'storage' | 'transcription',
    quantity: number
) {
    if (quantity <= 0) return;

    try {
        const db = await getMongoDb();
        const user = await db.collection<User>(Collections.USERS).findOne({ firebaseUid });

        if (!user || !user.stripeSubscriptionId || !user.billingSettings?.allowOverage) {
            // User not eligible for overage billing
            return;
        }

        // Fetch Plan logic
        // We need to know WHICH subscription item corresponds to "Storage" or "Transcription".
        // This is tricky because subscription items have IDs like 'si_...'.
        // We need to match the Price ID from our Plan definition to the Subscription Item.

        const plan = await db.collection<Plan>(Collections.PLANS).findOne({ name: user.plan });
        if (!plan) return;

        let targetPriceId = '';
        if (type === 'storage') targetPriceId = plan.stripeStoragePriceId || '';
        if (type === 'transcription') targetPriceId = plan.stripeTranscriptionPriceId || '';

        if (!targetPriceId) {
            console.warn(`[Usage] No metered price ID found for plan ${user.plan} and type ${type}`);
            return; // Config missing
        }

        // Fetch Subscription Items from Stripe
        const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);

        const item = subscription.items.data.find(i => i.price.id === targetPriceId);

        if (!item) {
            console.error(`[Usage] Subscription ${subscription.id} does not have price ${targetPriceId}`);
            // This might happen if they are on "Pro" but the Pro Product in Stripe doesn't have these metered prices attached yet.
            return;
        }

        // Report Usage
        // Stripe expects 'timestamp' (now). 
        // 'action': 'increment' is default.
        // NOTE: stripe.subscriptionItems.createUsageRecord was removed in SDK v18+,
        // but the API endpoint /v1/subscription_items/{id}/usage_records is still valid 
        // for legacy metered billing (Product without separate Meter).
        await stripe.rawRequest('POST', `/v1/subscription_items/${item.id}/usage_records`, {
            quantity: Math.ceil(quantity), // Stripe expects integers. 
            timestamp: Math.floor(Date.now() / 1000),
            action: 'increment',
        });

        console.log(`[Usage] Reported ${quantity} ${type} to Stripe for user ${firebaseUid}`);

    } catch (error) {
        console.error(`[Usage] Failed to report usage for ${firebaseUid}:`, error);
        // Don't throw, just log. We don't want to break the user flow if billing fails temporarily.
    }
}

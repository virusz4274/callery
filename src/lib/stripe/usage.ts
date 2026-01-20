
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
    if (process.env.NEXT_PUBLIC_ENABLE_BILLING === 'false') return;
    if (quantity === 0) return;

    try {
        const db = await getMongoDb();
        const user = await db.collection<User>(Collections.USERS).findOne({ firebaseUid });

        if (!user || !user.stripeCustomerId || !user.billingSettings?.allowOverage) {
            // User not eligible for overage billing (or disabled)
            return;
        }

        // Event Names must match what you configured in Stripe Dashboard
        const eventName = type === 'storage' ? 'storage_usage_gb' : 'transcription_usage_min';

        // Stripe V2 Meter Events
        // We send the 'value' as the quantity. The Stripe Meter must be configured to aggregate by 'sum'.
        // We use the Stripe Customer ID to link the event.
        await stripe.billing.meterEvents.create({
            event_name: eventName,
            payload: {
                stripe_customer_id: user.stripeCustomerId,
                value: quantity.toString(), // Payload values are strings in V2 API
            },
            timestamp: Math.floor(Date.now() / 1000),
        });

        console.log(`[Usage] Sent Meter Event '${eventName}' (Value: ${quantity}) for user ${firebaseUid}`);

    } catch (error) {
        console.error(`[Usage] Failed to report usage for ${firebaseUid}:`, error);
        // Don't throw, just log.
    }
}

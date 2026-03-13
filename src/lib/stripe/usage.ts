
import { stripe } from '@/lib/stripe';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { resolveExternalServiceIncident, safelyReportExternalServiceIncident } from '@/lib/external-service-incidents';
import { User, Plan } from '@/lib/db/types';

/**
 * Reports metered usage to Stripe for a specific user.
 * Storage events should represent PEAK stored bytes for the billing period.
 * Transcription is tracked in SECONDS (rounded to 15s blocks).
 * Stripe Meter Event values must be whole numbers.
 */
export async function reportUsage(
    firebaseUid: string,
    type: 'storage' | 'transcription',
    quantity: number,
    options?: { multiplier?: number; identifier?: string }
) {
    if (process.env.NEXT_PUBLIC_ENABLE_BILLING === 'false') return;
    if (!Number.isFinite(quantity)) return;

    // Apply multiplier if present (default 1.0)
    const multiplier = options?.multiplier || 1.0;
    const effectiveQuantity = quantity * multiplier;

    // Stripe requires integer values for meter events.
    const value = Math.trunc(effectiveQuantity);
    if (value === 0) return;

    try {
        const db = await getMongoDb();
        const user = await db.collection<User>(Collections.USERS).findOne({ firebaseUid });

        if (!user || !user.stripeCustomerId || !user.billingSettings?.allowOverage) {
            // User not eligible for overage billing (or disabled)
            return;
        }

        // Event Names must match what you configured in Stripe Dashboard
        const eventName = type === 'storage' ? 'storage_usage_bytes' : 'transcription_usage_seconds';

        // Stripe V2 Meter Events
        // Storage events are sent as the current peak for the billing period and should use a "Last" meter aggregation.
        // Transcription events are incremental and should use a "Sum" meter aggregation.
        // We use the Stripe Customer ID to link the event.
        await stripe.billing.meterEvents.create({
            identifier: options?.identifier,
            event_name: eventName,
            payload: {
                stripe_customer_id: user.stripeCustomerId,
                value: value.toString(), // Payload values are strings in V2 API
            },
            timestamp: Math.floor(Date.now() / 1000),
        });

        console.log(`[Usage] Sent Meter Event '${eventName}' (Value: ${value}, Base: ${quantity}, Mult: ${multiplier}) for user ${firebaseUid}`);
        await resolveExternalServiceIncident({
            provider: 'stripe',
            operation: 'report_usage',
        });

    } catch (error) {
        console.error(`[Usage] Failed to report usage for ${firebaseUid}:`, error);
        await safelyReportExternalServiceIncident({
            provider: 'stripe',
            service: 'Stripe',
            operation: 'report_usage',
            error,
            context: {
                firebaseUid,
                usageType: type,
                quantity,
                multiplier,
            },
            notifyAdmins: true,
        });
        // Don't throw, just log.
    }
}

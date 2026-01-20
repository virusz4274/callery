import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

// Agent: Call this when a transcription job completes
export async function reportTranscriptionUsage(subscriptionItemId: string, minutes: number, jobId: string) {
    try {
        await stripe.subscriptionItems.createUsageRecord(
            subscriptionItemId,
            {
                quantity: Math.ceil(minutes), // Stripe requires integers
                timestamp: Math.floor(Date.now() / 1000),
                action: 'increment'
            },
            { idempotencyKey: `tx_${jobId}` } // CRITICAL: Prevents double billing on retries
        );
    } catch (err) {
        console.error("Failed to report transcription usage:", err);
    }
}

// Agent: Call this on file upload/delete, or run as a nightly cron
export async function reportStorageSnapshot(subscriptionItemId: string, currentTotalGB: number) {
    try {
        // Usage of 'set' combined with 'max' aggregation ensures we bill for the peak storage used
        await stripe.subscriptionItems.createUsageRecord(
            subscriptionItemId,
            {
                quantity: Math.ceil(currentTotalGB),
                timestamp: Math.floor(Date.now() / 1000),
                action: 'set'
            }
        );
    } catch (err) {
        console.error("Failed to report storage usage:", err);
    }
}
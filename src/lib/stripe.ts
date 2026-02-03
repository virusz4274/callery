import Stripe from 'stripe';

// Fallback for self-hosted / non-billing environments
const apiKey = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_key_for_build';

export const stripe = new Stripe(apiKey, {
    apiVersion: '2026-01-28.clover' as any, // Latest stable version
    typescript: true,
});

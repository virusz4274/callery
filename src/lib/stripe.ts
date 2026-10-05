import Stripe from 'stripe';

let cached: Stripe | null = null;

/**
 * Lazily create the Stripe client. Throws an actionable error when
 * STRIPE_SECRET_KEY is missing instead of failing later with an opaque API
 * auth error. Never called when billing is disabled (see billingEnabled),
 * so self-hosted builds and requests don't need the key.
 *
 * Uses the fetch-based HTTP client so the same code runs on Node.js and on
 * edge runtimes (Cloudflare Workers) where Node's http stack is unavailable.
 */
export function getStripe(): Stripe {
    if (!cached) {
        const apiKey = process.env.STRIPE_SECRET_KEY;
        if (!apiKey) {
            throw new Error(
                'Missing STRIPE_SECRET_KEY environment variable (billing is enabled). See .env.example.',
            );
        }
        cached = new Stripe(apiKey, {
            typescript: true,
            httpClient: Stripe.createFetchHttpClient(),
            timeout: 30_000,
            maxNetworkRetries: 1,
        });
    }
    return cached;
}

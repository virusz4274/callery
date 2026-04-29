import Stripe from 'stripe';

import { env } from '@/lib/env';

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-01-28.clover' as any, // Preview version required for Meters V2 API (stripe.billing.meterEvents)
    typescript: true,
});

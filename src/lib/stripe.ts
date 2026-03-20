import Stripe from 'stripe';

import { env } from '@/lib/env';

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-01-28.clover' as any, // Latest stable version
    typescript: true,
});

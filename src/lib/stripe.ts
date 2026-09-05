import Stripe from 'stripe';

import { env } from '@/lib/env';

// Preview version required for Meters V2 API (stripe.billing.meterEvents). The Stripe SDK
// types pin apiVersion to a published version literal, so cast through Stripe's apiVersion type.
export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-01-28.clover' as Stripe.StripeConfig['apiVersion'],
    typescript: true,
});

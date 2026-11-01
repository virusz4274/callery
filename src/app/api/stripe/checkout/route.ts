import type { NextRequest } from 'next/server';
import { handleStripeCheckout } from '@/lib/stripe/checkout-http';

export async function POST(request: NextRequest) {
    return handleStripeCheckout(request);
}

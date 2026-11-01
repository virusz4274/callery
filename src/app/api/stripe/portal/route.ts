import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { ensureStripeCustomerId } from '@/lib/stripe/customer';
import { getPublicAppOrigin } from '@/lib/public-url';
import { requireBillingUser, billingErrorResponse } from '@/lib/stripe/http';
import { BillingChangeError } from '@/lib/stripe/plan-change';
import { restrictedPortalConfiguration } from '@/lib/stripe/portal';

export async function POST(req: NextRequest) {
    try {
        const user = await requireBillingUser(req);
        if (user.billingReview?.reason === 'customer_deleted_with_financial_history') throw new BillingChangeError('Contact support to reconcile the removed billing customer before reconnecting payment.');
        const body = await req.json().catch(() => ({}));
        let returnUrl = new URL('/settings?tab=billing', getPublicAppOrigin(req)).toString();
        if (body?.returnUrl && typeof body.returnUrl === 'string') {
            try { const url = new URL(body.returnUrl, getPublicAppOrigin(req)); if (url.origin === new URL(returnUrl).origin) returnUrl = url.toString(); }
            catch { /* Retain the configured safe return URL. */ }
        }
        const stripe = getStripe();
        const configuration = await restrictedPortalConfiguration(stripe);
        const customer = user.stripeCustomerId || await ensureStripeCustomerId(user);
        const session = await stripe.billingPortal.sessions.create({ customer, return_url: returnUrl, configuration });
        return NextResponse.json({ url: session.url });
    } catch (error) { return billingErrorResponse(error); }
}

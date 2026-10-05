import { logger } from '@/lib/logger';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getStripe } from '@/lib/stripe';
import { getAuthSubjectFromSession, getUserFromRequest } from '@/lib/auth-utils';
import { findUserByAuthSubject } from '@/lib/db/users';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { Plan } from '@/lib/db/types';
import Stripe from 'stripe';
import { ensureStripeCustomerId } from '@/lib/stripe/customer';
import { getPublicAppOrigin } from '@/lib/public-url';
import { env } from '@/lib/env';

const CheckoutBodySchema = z.object({
    priceId: z.string().trim().max(200).optional(),
    planKey: z.string().trim().max(100).optional(),
    returnUrl: z.string().max(2048).optional(),
    successUrl: z.string().max(2048).optional(),
    cancelUrl: z.string().max(2048).optional(),
}).strict();

function resolveSafeReturnUrl(
    candidateUrl: string | undefined,
    origin: string,
    fallbackPath: string
): string {
    const fallback = new URL(fallbackPath, origin).toString();
    if (!candidateUrl) {
        return fallback;
    }

    try {
        const parsed = new URL(candidateUrl, origin);
        if (parsed.origin !== origin) {
            return fallback;
        }

        return parsed.toString();
    } catch {
        return fallback;
    }
}

export async function POST(req: NextRequest) {
    if (!env.NEXT_PUBLIC_ENABLE_BILLING) {
        return NextResponse.json({ error: 'Billing is disabled on this instance.' }, { status: 403 });
    }

    try {
        // 1. Authenticate
        let uid = await getAuthSubjectFromSession();
        if (!uid) {
            uid = await getUserFromRequest(req);
        }
        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const rawBody = await req.json().catch(() => null);
        const parsedBody = CheckoutBodySchema.safeParse(rawBody ?? {});
        if (!parsedBody.success) {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }
        const { priceId, planKey, returnUrl, successUrl, cancelUrl } = parsedBody.data;
        const db = await getMongoDb();

        let selectedPlan: Plan | null = null;

        if (priceId) {
            selectedPlan = await db.collection<Plan>(Collections.PLANS).findOne({
                isActive: true,
                stripePriceId: priceId,
            });
        }

        if (!selectedPlan && planKey?.trim()) {
            selectedPlan = await db.collection<Plan>(Collections.PLANS).findOne({
                isActive: true,
                key: planKey.trim(),
                stripePriceId: { $ne: '' },
            });
        }

        if (!selectedPlan?.stripePriceId) {
            return NextResponse.json(
                { error: 'Invalid plan. Please choose a valid paid plan and try again.' },
                { status: 400 }
            );
        }

        // 2. Get User
        const user = await findUserByAuthSubject(uid);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Prevent duplicate recurring subscriptions.
        if (
            user.stripeSubscriptionId &&
            (user.stripeSubscriptionStatus === 'active' ||
                user.stripeSubscriptionStatus === 'trialing' ||
                user.stripeSubscriptionStatus === 'past_due' ||
                user.stripeSubscriptionStatus === 'unpaid' ||
                user.stripeSubscriptionStatus === 'incomplete')
        ) {
            return NextResponse.json(
                { error: 'You already have an active subscription. Please use the billing portal to change or cancel it first.' },
                { status: 409 }
            );
        }

        // Ensure stripeCustomerId exists. Create on-demand if missing.
        let stripeCustomerId = user.stripeCustomerId;
        if (!stripeCustomerId) {
            stripeCustomerId = await ensureStripeCustomerId(user);
        }

        // 3. Determine Mode (Subscription vs Payment) from Stripe Price.
        const price = await getStripe().prices.retrieve(selectedPlan.stripePriceId);
        if (!price.active) {
            return NextResponse.json({ error: 'Selected plan is currently unavailable.' }, { status: 400 });
        }

        const mode = price.type === 'recurring' ? 'subscription' : 'payment';
        if (selectedPlan.interval === 'lifetime' && mode !== 'payment') {
            return NextResponse.json(
                { error: 'Plan configuration error: lifetime plan must use a one-time Stripe price.' },
                { status: 400 }
            );
        }

        // 4. Create Checkout Session
        const appOrigin = getPublicAppOrigin(req);
        const resolvedSuccessUrl = resolveSafeReturnUrl(
            successUrl || returnUrl,
            appOrigin,
            '/settings?tab=billing&success=true'
        );
        const resolvedCancelUrl = resolveSafeReturnUrl(
            cancelUrl || returnUrl,
            appOrigin,
            '/settings?tab=billing&canceled=true'
        );

        const sessionParams: Stripe.Checkout.SessionCreateParams = {
            customer: stripeCustomerId,
            line_items: [
                {
                    price: selectedPlan.stripePriceId,
                    quantity: 1,
                },
            ],
            mode: mode,
            success_url: resolvedSuccessUrl,
            cancel_url: resolvedCancelUrl,
            allow_promotion_codes: true,
            billing_address_collection: 'required',
            client_reference_id: uid,
            metadata: {
                authSubject: uid,
                userId: user._id.toString(),
                selectedPlanKey: selectedPlan.key,
                selectedPriceId: selectedPlan.stripePriceId,
                selectedPlanName: selectedPlan.name,
            },
        };

        if (mode === 'subscription') {
            sessionParams.subscription_data = {
                metadata: {
                    authSubject: uid,
                    userId: user._id.toString(),
                    selectedPlanKey: selectedPlan.key,
                    selectedPriceId: selectedPlan.stripePriceId,
                    selectedPlanName: selectedPlan.name,
                },
            };
        } else {
            sessionParams.invoice_creation = {
                enabled: true,
            };
        }

        const session = await getStripe().checkout.sessions.create(sessionParams);

        return NextResponse.json({ url: session.url });

    } catch (error) {
        logger.error('Stripe Checkout Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal Server Error' },
            { status: 500 }
        );
    }
}

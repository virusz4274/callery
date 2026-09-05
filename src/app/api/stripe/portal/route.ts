import { logger } from '@/lib/logger';

import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getFirebaseUidFromSession, getUserFromRequest } from '@/lib/auth-utils';
import { findUserByFirebaseUid } from '@/lib/db/users';
import { ensureStripeCustomerId } from '@/lib/stripe/customer';
import { getPublicAppOrigin } from '@/lib/public-url';
import { env } from '@/lib/env';

function resolveSafeReturnUrl(candidateUrl: string | undefined, origin: string): string {
    const fallback = new URL('/settings', origin).toString();
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
        // 1. Authenticate User
        let uid = await getFirebaseUidFromSession();
        if (!uid) {
            uid = await getUserFromRequest(req);
        }

        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let returnUrl: string | undefined;
        if (req.headers.get('content-length') !== '0' && req.headers.get('content-type')?.includes('json')) {
            const body = await req.json().catch(() => null);
            if (body !== null && (typeof body !== 'object' || Array.isArray(body))) {
                return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
            }
            if (body && typeof body.returnUrl !== 'undefined' && typeof body.returnUrl !== 'string') {
                return NextResponse.json({ error: 'Invalid returnUrl' }, { status: 400 });
            }
            returnUrl = body?.returnUrl;
        }

        // 2. Get User from DB
        const user = await findUserByFirebaseUid(uid);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        let stripeCustomerId = user.stripeCustomerId;
        if (!stripeCustomerId) {
            stripeCustomerId = await ensureStripeCustomerId(user);
        }

        // 3. Create Portal Session
        const session = await stripe.billingPortal.sessions.create({
            customer: stripeCustomerId,
            return_url: resolveSafeReturnUrl(returnUrl, getPublicAppOrigin(req)),
        });

        return NextResponse.json({ url: session.url });
    } catch (error) {
        logger.error('Stripe Portal Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal Server Error' },
            { status: 500 }
        );
    }
}

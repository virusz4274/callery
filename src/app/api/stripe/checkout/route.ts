
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getFirebaseUidFromSession, getUserFromRequest } from '@/lib/auth-utils';
import { findUserByFirebaseUid } from '@/lib/db/users';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { Plan } from '@/lib/db/types';

type CheckoutRequestBody = {
    priceId?: string;
    planName?: string;
    returnUrl?: string;
    successUrl?: string;
    cancelUrl?: string;
};

export async function POST(req: NextRequest) {
    try {
        // 1. Authenticate
        let uid = await getFirebaseUidFromSession();
        if (!uid) {
            uid = await getUserFromRequest(req);
        }
        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { priceId, planName, returnUrl, successUrl, cancelUrl } = await req.json() as CheckoutRequestBody;

        let resolvedPriceId = priceId;

        if (!resolvedPriceId && planName) {
            const db = await getMongoDb();
            const normalizedPlanName = planName.trim();
            const matchedPlan = await db.collection<Plan>(Collections.PLANS).findOne({
                isActive: true,
                name: normalizedPlanName,
                stripePriceId: { $ne: '' },
            });
            resolvedPriceId = matchedPlan?.stripePriceId;
        }

        if (!resolvedPriceId) {
            return NextResponse.json({ error: 'priceId (or valid planName) is required' }, { status: 400 });
        }

        // 2. Get User
        const user = await findUserByFirebaseUid(uid);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Ensure stripeCustomerId exists (it should now, but safety check)
        if (!user.stripeCustomerId) {
            // This checks strictly. If missing, we could create it here too, but users.ts handles it on login.
            return NextResponse.json({ error: 'No billing account found. Please log out and back in.' }, { status: 400 });
        }

        // 3. Determine Mode (Subscription vs Payment)
        // We need to know if the price is recurring. 
        // We can fetch the price or just assume subscription unless told otherwise.
        // For efficiency, let's fetch the price details to be sure, or catch error.
        const price = await stripe.prices.retrieve(resolvedPriceId);
        const mode = price.type === 'recurring' ? 'subscription' : 'payment';

        // 4. Create Checkout Session
        const resolvedSuccessUrl = successUrl || returnUrl || `${req.nextUrl.origin}/settings?success=true`;
        const resolvedCancelUrl = cancelUrl || returnUrl || `${req.nextUrl.origin}/settings?canceled=true`;

        const sessionParams: {
            customer: string;
            line_items: Array<{ price: string; quantity: number }>;
            mode: 'subscription' | 'payment';
            success_url: string;
            cancel_url: string;
            allow_promotion_codes: boolean;
            billing_address_collection: 'required';
            metadata: Record<string, string>;
        } = {
            customer: user.stripeCustomerId,
            line_items: [
                {
                    price: resolvedPriceId,
                    quantity: 1,
                },
            ],
            mode: mode,
            success_url: resolvedSuccessUrl,
            cancel_url: resolvedCancelUrl,
            allow_promotion_codes: true,
            billing_address_collection: 'required',
            metadata: {
                firebaseUid: uid,
                userId: user._id.toString(),
            },
        };

        const session = await stripe.checkout.sessions.create(sessionParams);

        return NextResponse.json({ url: session.url });

    } catch (error) {
        console.error('Stripe Checkout Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal Server Error' },
            { status: 500 }
        );
    }
}

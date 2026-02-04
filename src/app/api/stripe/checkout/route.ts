
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getFirebaseUidFromSession, getUserFromRequest } from '@/lib/auth-utils';
import { findUserByFirebaseUid } from '@/lib/db/users';

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

        const { priceId, returnUrl } = await req.json();

        if (!priceId) {
            return NextResponse.json({ error: 'Price ID is required' }, { status: 400 });
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
        const price = await stripe.prices.retrieve(priceId);
        const mode = price.type === 'recurring' ? 'subscription' : 'payment';

        // 4. Create Checkout Session
        const sessionParams: any = {
            customer: user.stripeCustomerId,
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: mode,
            success_url: returnUrl || `${req.nextUrl.origin}/settings?success=true`,
            cancel_url: returnUrl || `${req.nextUrl.origin}/settings?canceled=true`,
            allow_promotion_codes: true,
            billing_address_collection: 'required',
            metadata: {
                firebaseUid: uid,
                userId: user._id.toString(),
            },
        };

        // Add Billing Threshold for Subscriptions (Charge immediately if overage > $10)
        if (mode === 'subscription') {
            sessionParams.subscription_data = {
                billing_thresholds: {
                    amount_gte: 1000, // 1000 cents = $10.00 USD
                },
            };
        }

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

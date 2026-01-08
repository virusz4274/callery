
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getFirebaseUidFromSession, getUserFromRequest } from '@/lib/auth-utils';
import { findUserByFirebaseUid, updateUser } from '@/lib/db/users';

export async function POST(req: NextRequest) {
    try {
        // 1. Authenticate User
        let uid = await getFirebaseUidFromSession();
        if (!uid) {
            uid = await getUserFromRequest(req);
        }

        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { priceId, successUrl, cancelUrl } = await req.json();

        if (!priceId) {
            return NextResponse.json({ error: 'Missing priceId' }, { status: 400 });
        }

        // 2. Get User from DB
        const user = await findUserByFirebaseUid(uid);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // 3. Get or Create Stripe Customer ID
        let stripeCustomerId = user.stripeCustomerId;

        if (!stripeCustomerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: user.name || `${user.firstName} ${user.lastName}`,
                metadata: {
                    firebaseUid: uid,
                    userId: user._id.toString(),
                },
            });
            stripeCustomerId = customer.id;

            // Save to DB
            await updateUser(uid, { stripeCustomerId });
        }

        // 4. Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            customer: stripeCustomerId,
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: successUrl || `${req.nextUrl.origin}/settings?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl || `${req.nextUrl.origin}/settings`,
            metadata: {
                firebaseUid: uid,
                userId: user._id.toString(),
            },
            allow_promotion_codes: true,
        });

        return NextResponse.json({ url: session.url });
    } catch (error) {
        console.error('Stripe Checkout Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal Server Error' },
            { status: 500 }
        );
    }
}

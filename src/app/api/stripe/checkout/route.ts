
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

        const { priceId, planName, successUrl, cancelUrl } = await req.json();

        let finalPriceId = priceId;

        // Lookup Plan if only planName is provided
        if (!finalPriceId && planName) {
            const { getMongoDb, Collections } = await import('@/lib/mongodb');
            const db = await getMongoDb();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const plan = await db.collection(Collections.PLANS).findOne({ name: planName });
            if (plan && plan.stripePriceId) {
                finalPriceId = plan.stripePriceId;
            }
        }

        if (!finalPriceId) {
            return NextResponse.json({ error: 'Missing priceId or invalid planName' }, { status: 400 });
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

        // Lookup Plan details to add metered prices
        const { getMongoDb, Collections } = await import('@/lib/mongodb');
        const db = await getMongoDb();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const planObj = await db.collection(Collections.PLANS).findOne({
            $or: [{ stripePriceId: finalPriceId }, { name: planName }]
        });

        const lineItems = [
            {
                price: finalPriceId,
                quantity: 1,
            },
        ];

        // Add metered prices if they exist in the plan
        if (planObj?.stripeStoragePriceId) {
            lineItems.push({ price: planObj.stripeStoragePriceId, quantity: 1 }); // Metered prices don't really have 'quantity' in checkout but needed for sub
        }
        if (planObj?.stripeTranscriptionPriceId) {
            lineItems.push({ price: planObj.stripeTranscriptionPriceId, quantity: 1 });
        }

        // 4. Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            customer: stripeCustomerId,
            client_reference_id: uid, // Explicitly link session to user
            line_items: lineItems,
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


import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getFirebaseUidFromSession, getUserFromRequest } from '@/lib/auth-utils';
import { findUserByFirebaseUid } from '@/lib/db/users';

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

        const { returnUrl } = await req.json();

        // 2. Get User from DB
        const user = await findUserByFirebaseUid(uid);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        if (!user.stripeCustomerId) {
            return NextResponse.json({ error: 'No billing account found.' }, { status: 400 });
        }

        // 3. Create Portal Session
        const session = await stripe.billingPortal.sessions.create({
            customer: user.stripeCustomerId,
            return_url: returnUrl || `${req.nextUrl.origin}/settings`,
        });

        return NextResponse.json({ url: session.url });
    } catch (error) {
        console.error('Stripe Portal Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal Server Error' },
            { status: 500 }
        );
    }
}


import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { billingEnabled } from '@/lib/config';
import { getAuthSubjectFromSession, getUserFromRequest } from '@/lib/auth-utils';
import { findUserByAuthSubject } from '@/lib/db/users';

export async function POST(req: NextRequest) {
    if (!billingEnabled()) {
        return NextResponse.json({ error: 'Billing is disabled on this instance.' }, { status: 404 });
    }
    try {
        const stripe = getStripe();
        // 1. Authenticate User
        let uid = await getAuthSubjectFromSession();
        if (!uid) {
            uid = await getUserFromRequest(req);
        }

        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { returnUrl } = await req.json();

        // 2. Get User from DB
        const user = await findUserByAuthSubject(uid);
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

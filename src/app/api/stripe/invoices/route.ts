import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getFirebaseUidFromSession, getUserFromRequest } from '@/lib/auth-utils';
import { findUserByFirebaseUid } from '@/lib/db/users';

type InvoiceStatus = 'Paid' | 'Pending' | 'Failed';

function toInvoiceStatus(status: string | null): InvoiceStatus {
    if (status === 'paid') {
        return 'Paid';
    }

    if (status === 'void' || status === 'uncollectible') {
        return 'Failed';
    }

    return 'Pending';
}

export async function GET(req: NextRequest) {
    if (process.env.NEXT_PUBLIC_ENABLE_BILLING === 'false') {
        return NextResponse.json({ error: 'Billing is disabled on this instance.' }, { status: 403 });
    }

    try {
        let uid = await getFirebaseUidFromSession();
        if (!uid) {
            uid = await getUserFromRequest(req);
        }

        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await findUserByFirebaseUid(uid);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        if (!user.stripeCustomerId) {
            return NextResponse.json({ invoices: [] });
        }

        const limitParam = req.nextUrl.searchParams.get('limit');
        const limit = Math.min(Math.max(Number(limitParam || '12'), 1), 50);

        const invoices = await stripe.invoices.list({
            customer: user.stripeCustomerId,
            limit,
        });

        return NextResponse.json({
            invoices: invoices.data.map((invoice) => ({
                id: invoice.id,
                date: new Date(invoice.created * 1000).toISOString(),
                amount: (invoice.amount_paid || invoice.amount_due || 0) / 100,
                status: toInvoiceStatus(invoice.status),
                url: invoice.hosted_invoice_url,
            })),
        });
    } catch (error) {
        console.error('Stripe invoices fetch error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal Server Error' },
            { status: 500 }
        );
    }
}

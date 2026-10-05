import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { getAuthSubjectFromSession, getUserFromRequest } from '@/lib/auth-utils';
import { findUserByAuthSubject } from '@/lib/db/users';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

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
    if (!env.NEXT_PUBLIC_ENABLE_BILLING) {
        return NextResponse.json({ error: 'Billing is disabled on this instance.' }, { status: 403 });
    }

    try {
        let uid = await getAuthSubjectFromSession();
        if (!uid) {
            uid = await getUserFromRequest(req);
        }

        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await findUserByAuthSubject(uid);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        if (!user.stripeCustomerId) {
            return NextResponse.json({ invoices: [] });
        }

        const limitParam = req.nextUrl.searchParams.get('limit');
        const limit = Math.min(Math.max(Number(limitParam || '12'), 1), 50);

        const invoices = await getStripe().invoices.list({
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
        logger.error('Stripe invoices fetch error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal Server Error' },
            { status: 500 }
        );
    }
}

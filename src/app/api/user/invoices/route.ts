import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { findUserByAuthSubject } from '@/lib/db/users';
import { listCustomerInvoices } from '@/lib/stripe/invoices';

/**
 * GET /api/user/invoices
 *
 * List the authenticated user's Stripe invoices, newest first.
 * Returns an empty list when billing is disabled or the user has no
 * billing account yet.
 */
export async function GET(request: NextRequest) {
    const authSubject = await getUserFromRequest(request);

    if (!authSubject) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }

    try {
        const user = await findUserByAuthSubject(authSubject);
        if (!user) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            );
        }

        const invoices = await listCustomerInvoices(user.stripeCustomerId);
        return NextResponse.json({ invoices });
    } catch (error) {
        console.error('Error fetching invoices:', error);
        return NextResponse.json(
            { error: 'Failed to fetch invoices' },
            { status: 500 }
        );
    }
}

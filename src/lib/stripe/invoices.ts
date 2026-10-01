import { getStripe } from '@/lib/stripe';
import { billingEnabled } from '@/lib/config';
import type { Invoice } from '@/lib/types';

/**
 * List a customer's Stripe invoices, newest first.
 * Returns an empty array when billing is disabled or the user has no
 * Stripe customer — both are normal states, not errors.
 */
export async function listCustomerInvoices(
    stripeCustomerId: string | undefined,
    limit: number = 20
): Promise<Invoice[]> {
    if (!billingEnabled() || !stripeCustomerId) return [];

    const stripe = getStripe();
    const invoices = await stripe.invoices.list({
        customer: stripeCustomerId,
        limit: Math.min(Math.max(1, limit), 100),
    });

    return invoices.data.map((invoice) => {
        const status: Invoice['status'] =
            invoice.status === 'paid' ? 'Paid'
                : invoice.status === 'void' || invoice.status === 'uncollectible' ? 'Failed'
                    : 'Pending';
        const cents = status === 'Paid' ? invoice.amount_paid : invoice.amount_due;
        return {
            id: invoice.id,
            date: new Date(invoice.created * 1000).toISOString(),
            amount: cents / 100,
            status,
        };
    });
}

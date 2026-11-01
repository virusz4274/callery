import type { Db } from 'mongodb';
import type Stripe from 'stripe';
import { Collections } from '@/lib/mongodb';
import type { UsageEvent } from './usage-queue';
import { verifyUsageInvoice } from './invoice-verification';

/** Missing invoice webhooks must not strand prepaid reserves or financial
 * deletion. Fair polling rotates customers whose cycle has not closed yet. */
export async function reconcileUsageInvoices(db: Db, stripe: Stripe, limit = 20) {
    const events = db.collection<UsageEvent & { invoiceCheckedAt?: Date }>(Collections.USAGE_EVENTS);
    const candidates = await events.find({ value: { $gt: 0 }, processingStatus: 'processed', billedAt: { $exists: false } }).sort({ invoiceCheckedAt: 1 }).limit(limit).toArray();
    const seen = new Set<string>(); let verified = 0; let failed = 0;
    for (const event of candidates) {
        if (seen.has(event.customerId)) continue;
        seen.add(event.customerId);
        try {
            for await (const invoice of stripe.invoices.list({ customer: event.customerId, created: { gte: Math.max(0, Math.floor((event.periodStart?.getTime() || event.timestamp * 1000) / 1000) - 86400) }, limit: 100 })) {
                if (['open', 'paid', 'uncollectible'].includes(invoice.status || '')) verified += await verifyUsageInvoice(invoice.id, { db, stripe });
            }
        } catch { failed++; }
        finally { await events.updateMany({ customerId: event.customerId, billedAt: { $exists: false } }, { $set: { invoiceCheckedAt: new Date() } }); }
    }
    return { verified, failed };
}

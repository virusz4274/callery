import 'server-only';
import type { Db } from 'mongodb';
import { billingDependencies, type BillingDependencies } from './runtime';

export const CATALOG_DISCOVERY = 'billing_catalog_discovery';
export interface CatalogDiscovery {
    _id: 'stripe'; revision: number; refreshedRevision?: number; changedAt?: Date; checkedAt?: Date;
    stripeAccountId?: string; lastError?: string;
    prices?: { id: string; lookupKey: string | null; productId: string; productName?: string; amountDecimal: string; currency: string;
        livemode: boolean; type: string; interval?: string; meterId?: string | null }[];
}
/** Invalidate discovery only. A webhook can never activate customer financial terms. */
export async function markCatalogDiscoveryDirty(objectId: string, db: Db): Promise<void> {
    if (!/^(price|prod|mtr)_[A-Za-z0-9]+$/.test(objectId)) return;
    await db.collection<CatalogDiscovery>(CATALOG_DISCOVERY).updateOne({ _id: 'stripe' }, {
        $inc: { revision: 1 }, $set: { changedAt: new Date() },
    }, { upsert: true });
}
export async function getCatalogDiscoveryStatus(db: Db) {
    return db.collection<CatalogDiscovery>(CATALOG_DISCOVERY).findOne({ _id: 'stripe' });
}
/** Authoritative imports remain separate; this bounded cache helps the admin discover replacement price IDs. */
export async function refreshCatalogDiscovery(dependencies?: BillingDependencies) {
    const { db, stripe } = await billingDependencies(dependencies), rows = db.collection<CatalogDiscovery>(CATALOG_DISCOVERY);
    const old = await rows.findOne({ _id: 'stripe' });
    if (old?.checkedAt && old.checkedAt.getTime() > Date.now() - 15 * 60_000 && old.refreshedRevision === old.revision) return { refreshed: false };
    const prices: NonNullable<CatalogDiscovery['prices']> = [];
    try {
        const account = await stripe.accounts.retrieve(null);
        for await (const price of stripe.prices.list({ active: true, limit: 100, expand: ['data.product'] })) {
            if (prices.length >= 2000) throw new Error('Stripe price discovery exceeded its bounded cache. Select explicit price IDs when importing.');
            const product = typeof price.product === 'object' ? price.product : undefined;
            prices.push({ id: price.id, lookupKey: price.lookup_key, productId: typeof price.product === 'string' ? price.product : price.product.id,
                ...(product && !('deleted' in product) ? { productName: product.name } : {}),
                amountDecimal: String(price.unit_amount_decimal ?? price.unit_amount ?? ''), currency: price.currency, livemode: price.livemode,
                type: price.type, ...(price.recurring ? { interval: price.recurring.interval, meterId: price.recurring.meter } : {}) });
        }
        await rows.updateOne({ _id: 'stripe' }, { $set: { stripeAccountId: account.id, prices, checkedAt: new Date(), refreshedRevision: old?.revision || 0 },
            $setOnInsert: { revision: 0 }, $unset: { lastError: '' } }, { upsert: true });
        return { refreshed: true, prices: prices.length };
    } catch (error) {
        await rows.updateOne({ _id: 'stripe' }, { $set: { checkedAt: new Date(), lastError: error instanceof Error ? error.message : 'Stripe catalog discovery failed.' }, $setOnInsert: { revision: 0 } }, { upsert: true });
        return { refreshed: false, needsReview: true };
    }
}

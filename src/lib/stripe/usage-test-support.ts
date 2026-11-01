import type { Db } from 'mongodb';
import { BILLING_CATALOG, type UsagePricingTier } from './catalog';
import { createUsageTariffSnapshot, type UsageTariffPair } from './usage-tariff';

/** Isolated test fixtures only. Never authorizes a deployment catalog. */
export function usageTariffFixture(tier: UsagePricingTier = 'recurring', options: {
    catalogVersion?: string; audioPrice?: string; storagePrice?: string; audioPriceId?: string; storagePriceId?: string;
} = {}): UsageTariffPair {
    const prefix = tier === 'lifetime' ? 'lifetime_' : '', common = { catalogVersion: options.catalogVersion || `fixture-${tier}`, usageTier: tier, currency: 'usd' as const };
    return { transcription: createUsageTariffSnapshot({ ...common, kind: 'transcription', priceId: options.audioPriceId || `price_${prefix}transcription`,
        meterId: `meter_${prefix}transcription`, eventName: (tier === 'lifetime' ? BILLING_CATALOG.lifetime.meters : BILLING_CATALOG.meters).transcription.eventName,
        quantityUnit: 'weighted_15s_block', aggregation: 'sum', unitAmountDecimal: options.audioPrice || '0.25', minimumChargeMicros: tier === 'recurring' ? 10_000 : 0 }),
    storage: createUsageTariffSnapshot({ ...common, kind: 'storage', priceId: options.storagePriceId || `price_${prefix}storage`,
        meterId: `meter_${prefix}storage`, eventName: (tier === 'lifetime' ? BILLING_CATALOG.lifetime.meters : BILLING_CATALOG.meters).storage.eventName,
        quantityUnit: 'milliGiB', aggregation: 'last', unitAmountDecimal: options.storagePrice || '0.02', minimumChargeMicros: 0 }) };
}
export async function archiveUsageTariffFixture(db: Db, pair: UsageTariffPair): Promise<void> {
    const bundles = db.collection<{ _id: string; state: string; plans: { usageTariffs: UsageTariffPair }[] }>('billing_catalog_bundles');
    const old = await bundles.findOne({ _id: pair.storage.catalogVersion });
    if (old) await bundles.updateOne({ _id: old._id }, { $set: { plans: [...old.plans, { usageTariffs: pair }] } });
    else await bundles.insertOne({ _id: pair.storage.catalogVersion, state: 'published', plans: [{ usageTariffs: pair }] });
}

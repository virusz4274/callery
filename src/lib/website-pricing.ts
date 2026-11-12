import { websitePricingSchema, type WebsitePricingSnapshot } from '../../shared/website-pricing';
import type { MarketingPricing } from './marketing-pricing';

/** Only the curated display projection crosses the app/website boundary. */
export function createWebsitePricingSnapshot(pricing: MarketingPricing, sourceAppOrigin: string, now = new Date()): WebsitePricingSnapshot {
    return websitePricingSchema.parse({
        version: 1,
        sourceAppOrigin: new URL(sourceAppOrigin).origin,
        generatedAt: now.toISOString(),
        pricing: {
            trial: pricing.trial,
            plans: pricing.plans.map(plan => ({
                key: plan.key, name: plan.name, description: plan.description,
                price: plan.price, currency: plan.currency, interval: plan.interval,
                storageBytes: plan.storageBytes, weightedMinutes: plan.weightedMinutes,
                usage: plan.usage, available: Boolean(plan.checkout),
            })),
        },
    });
}

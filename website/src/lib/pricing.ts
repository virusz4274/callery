import savedPricing from '../data/pricing.json';
import { websitePricingSchema } from '../../../shared/website-pricing';
import { siteConfig } from './site';

export const pricingSnapshot = savedPricing === null ? null : websitePricingSchema.parse(savedPricing);

if (siteConfig.indexable && pricingSnapshot
    && new URL(pricingSnapshot.sourceAppOrigin).origin !== siteConfig.appOrigin) {
    throw new Error('The pricing snapshot must come from PUBLIC_APP_URL. Run pnpm website:sync-pricing --from <app-origin> first.');
}
if (siteConfig.indexable && !siteConfig.comingSoon && !pricingSnapshot) {
    throw new Error('An indexable open website requires a validated pricing snapshot from PUBLIC_APP_URL. Run pnpm website:sync-pricing --from <app-origin> first.');
}

export function formatPrice(value: number, currency: string): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency,
        maximumFractionDigits: Number.isInteger(value) ? 0 : 2 }).format(value);
}

export function formatStorage(bytes: number): string {
    const gib = bytes / 1024 ** 3;
    return gib >= 1 ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(gib)} GiB`
        : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(bytes / 1024 ** 2)} MiB`;
}

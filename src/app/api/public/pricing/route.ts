import { billingEnabled } from '@/lib/config';
import { getConfiguredPublicAppOrigin } from '@/lib/public-url';
import { getWebsitePricing } from '@/lib/website-pricing-server';
import { createPublicPricingHandler } from './handler';

export const dynamic = 'force-dynamic';
export const GET = createPublicPricingHandler({
    enabled: billingEnabled,
    load: getWebsitePricing,
    origin: getConfiguredPublicAppOrigin,
});

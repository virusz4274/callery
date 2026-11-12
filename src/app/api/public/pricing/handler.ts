import { NextResponse } from 'next/server';
import type { MarketingPricing } from '@/lib/marketing-pricing';
import { createWebsitePricingSnapshot } from '@/lib/website-pricing';

type Dependencies = {
    enabled: () => boolean;
    load: () => Promise<MarketingPricing>;
    origin: () => string;
    now?: () => Date;
};

const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

export function createPublicPricingHandler(dependencies: Dependencies) {
    return async function GET() {
        if (!dependencies.enabled()) {
            return NextResponse.json({ error: 'Managed pricing is not available on this instance.' }, { status: 404, headers });
        }
        try {
            const snapshot = createWebsitePricingSnapshot(await dependencies.load(), dependencies.origin(), dependencies.now?.());
            return NextResponse.json(snapshot, { headers });
        } catch {
            return NextResponse.json({ error: 'Published pricing is temporarily unavailable. Try again later.' }, { status: 503, headers });
        }
    };
}

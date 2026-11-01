import 'server-only';
import { getPublishedPlans } from '@/app/actions/plans';
import { billingEnabled } from '@/lib/config';
import { getRequiredDefaultPlan } from '@/lib/db/users';
import { projectMarketingPricing, type MarketingPricing } from '@/lib/marketing-pricing';

/** Both sources are reads. Missing configuration never exposes operator errors to visitors. */
export async function getMarketingPricing(): Promise<MarketingPricing> {
    if (!billingEnabled()) return { trial: null, plans: [] };
    const [paid, trial] = await Promise.allSettled([getPublishedPlans(), getRequiredDefaultPlan()]);
    return projectMarketingPricing(paid.status === 'fulfilled' ? paid.value : [], trial.status === 'fulfilled' ? trial.value : null);
}

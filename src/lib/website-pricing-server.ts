import 'server-only';
import { getPublishedPlans } from '@/app/actions/plans';
import { getRequiredDefaultPlan } from '@/lib/db/users';
import { projectMarketingPricing } from '@/lib/marketing-pricing';

/** Export must fail on incomplete reads; the interactive page can degrade gracefully. */
export async function getWebsitePricing() {
    const [plans, trial] = await Promise.all([getPublishedPlans(true), getRequiredDefaultPlan()]);
    return projectMarketingPricing(plans, trial);
}

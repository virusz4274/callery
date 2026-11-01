import { effectiveBillingEntitlementSource, type BillingEntitlementIdentity } from './entitlement-source';

export type FundingSource = 'customer' | 'trial' | 'grant' | 'internal' | 'selfhost';

/** Funding follows the entitlement, never the administrator role or a selected paid plan. */
export function resolveFundingSource(user: BillingEntitlementIdentity, managed: boolean): FundingSource | undefined {
    if (!managed) return 'selfhost';
    const source = effectiveBillingEntitlementSource(user);
    if (source === 'admin') return user.planKey === 'internal' ? 'internal' : 'grant';
    if (source === 'trial' || (!source && user.planKey === 'free-trial' && !user.stripeSubscriptionId && !user.stripeSubscriptionStatus)) return 'trial';
    if (source === 'subscription' || source === 'lifetime') return 'customer';
    return undefined;
}

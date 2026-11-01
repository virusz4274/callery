import type { BillingEntitlement } from './billing-types';

export interface BillingEntitlementIdentity {
    billingEntitlement?: BillingEntitlement;
    planKey?: string;
    stripeSubscriptionId?: string;
    stripeSubscriptionStatus?: string;
}

/** Legacy administrator plans did not persist a source. A subscription link
 * makes that history ambiguous; only an explicit entitlement may authorize it. */
export function effectiveBillingEntitlementSource(user: BillingEntitlementIdentity): BillingEntitlement['source'] | undefined {
    const source = user.billingEntitlement?.source;
    if (source !== undefined) return source;
    if ((user.planKey === 'internal' || user.planKey === 'custom') && !user.stripeSubscriptionId && !user.stripeSubscriptionStatus) return 'admin';
    return undefined;
}

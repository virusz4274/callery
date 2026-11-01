import type { BillingEntitlementIdentity } from '@/lib/stripe/entitlement-source';
import { resolveFundingSource } from '@/lib/stripe/funding-source';
import type { User } from '@/lib/db/types';

/** Internal is an explicit administrator entitlement, not a large numeric quota. */
export function hasUnlimitedTranscription(user: BillingEntitlementIdentity, managed: boolean): boolean {
    if (user.planKey !== 'internal') return false;
    if (!managed) return true;
    try { return resolveFundingSource(user, true) === 'internal'; }
    catch { return false; }
}

/** Total processed audio includes paid overage; it is not the same counter as
 * successfully consumed included allowance when concurrent work completes. */
export function getTranscriptionAllowanceUsed(user: Pick<User, 'billingAccount' | 'transcriptionUsed' | 'transcriptionAllocation'> & BillingEntitlementIdentity): number {
    const source = resolveFundingSource(user, true);
    if (source !== 'customer') return user.transcriptionUsed || 0;
    const account = user.billingAccount;
    const period = account?.currentPeriodId ? account.periods[account.currentPeriodId] : undefined;
    return period?.includedConsumedSeconds ?? Math.min(user.transcriptionUsed || 0, user.transcriptionAllocation);
}

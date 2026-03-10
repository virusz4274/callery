import type { User } from './db/types';
import type { AccessResult } from './access-control-types';

export const IS_BILLING_ENABLED = process.env.NEXT_PUBLIC_ENABLE_BILLING !== 'false';

export function isTrialExpired(user: User): boolean {
    if (!IS_BILLING_ENABLED) {
        return false;
    }

    if (user.plan !== 'Free Trial' && user.plan !== 'Free') {
        return false;
    }

    if (!user.trialEndsAt) {
        return false;
    }

    return new Date() > user.trialEndsAt;
}

export function checkUserAccess(user: User): AccessResult {
    if (user.disabled) {
        return { allowed: false, reason: 'Account disabled.' };
    }

    return { allowed: true };
}

export function hasBillingIssue(user: User): AccessResult | null {
    if (user.stripeSubscriptionStatus === 'past_due' || user.stripeSubscriptionStatus === 'unpaid') {
        return {
            allowed: false,
            reason: 'Your account is restricted due to a failed payment. Please update your payment method.',
        };
    }

    if (user.stripeSubscriptionStatus === 'canceled' && user.stripeCurrentPeriodEnd && new Date() > user.stripeCurrentPeriodEnd) {
        return {
            allowed: false,
            reason: 'Your subscription has been canceled and the billing period has ended.',
        };
    }

    return null;
}

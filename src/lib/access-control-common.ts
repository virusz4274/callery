import { env } from './env';
import type { User } from './db/types';
import type { AccessResult } from './access-control-types';
import { isFreeTrialPlanKey } from './plans';

export const IS_BILLING_ENABLED = env.NEXT_PUBLIC_ENABLE_BILLING;

export function isTrialExpired(user: User): boolean {
    if (!IS_BILLING_ENABLED) {
        return false;
    }

    if (!isFreeTrialPlanKey(user.planKey)) {
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

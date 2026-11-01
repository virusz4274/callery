import { publicEnv } from './public-env';
import type { User } from './db/types';
import type { AccessResult } from './access-control-types';
import { isFreeTrialPlanKey } from './plans';
import { hasVerifiedMetering, sourcePlanUsableWhileAwaitingPayment } from './stripe/billing-types';
import { effectiveBillingEntitlementSource } from './stripe/entitlement-source';
import { hasBlockingBillingReview, hasBlockingFinancialReview } from './stripe/financial-review';

export function isBillingEnabled(): boolean { return publicEnv.NEXT_PUBLIC_ENABLE_BILLING; }

export function isTrialExpired(user: User, now = new Date()): boolean {
    if (!isBillingEnabled()) {
        return false;
    }

    if (!isFreeTrialPlanKey(user.planKey) && effectiveBillingEntitlementSource(user) !== 'trial') {
        return false;
    }

    return !(user.trialEndsAt instanceof Date) || !Number.isFinite(user.trialEndsAt.getTime()) || now >= user.trialEndsAt;
}

export function checkUserAccess(user: User): AccessResult {
    if (user.disabled || user.softDelete?.isDeleted || user.teamInvitationPending) {
        return { allowed: false, reason: 'Account disabled.' };
    }

    return { allowed: true };
}

/** Only new paid operations use this policy. Reading/exporting data does not. */
export function hasBillingIssue(user: User, now = new Date()): AccessResult | null {
    void now;
    const blocked = (reason: string): AccessResult => ({ allowed: false, reason });
    if (hasBlockingBillingReview(user.billingReview) || hasBlockingFinancialReview(user.billingAccount)) return blocked('Your billing account needs review. Existing recordings remain available; contact support before starting new usage.');
    if (user.billingRecovery?.purgingAt) return blocked('Archive deletion is already in progress. Contact your administrator before starting new work.');
    const source = effectiveBillingEntitlementSource(user);
    if (source === 'admin') return null;
    if (source === 'trial' || (!source && isFreeTrialPlanKey(user.planKey))) return null;
    if (!source) return blocked('Your billing entitlement needs verification. Existing recordings remain available; contact support.');
    if (user.billingRecovery) return blocked('Restore funded billing before starting new usage. Your archive is available during its 30-day recovery window.');
    if (user.billingOperation && !['applied', 'canceled'].includes(user.billingOperation.state)
        && !(sourcePlanUsableWhileAwaitingPayment(user) && hasVerifiedMetering(user))) return blocked('A plan change needs to finish before starting new usage.');
    if (Object.keys(user.stripePaymentIssues || {}).length) return blocked('A payment needs attention. Resolve outstanding invoices in Billing & Plans before uploading or transcribing; existing recordings remain available.');
    if (source === 'lifetime') {
        if (!user.lifetimePurchase || user.lifetimeUsageSetup?.state !== 'ready' || !hasVerifiedMetering(user)) {
            return blocked('Your lifetime purchase is preserved. Complete usage billing setup in Billing & Plans before uploading or transcribing.');
        }
    }
    if (!user.stripeSubscriptionId) return blocked('Set up usage billing before uploading or transcribing.');
    const status = user.stripeSubscriptionStatus;
    if (source === 'subscription' && status === 'active' && !hasVerifiedMetering(user)) return blocked('Usage billing configuration needs verification. Existing recordings remain available; contact support before starting new usage.');
    if (status === 'active' || (status === 'trialing' && source !== 'lifetime')) return null;
    return blocked('New uploads and transcription are paused until billing is healthy. Update your payment method in Billing & Plans; existing recordings remain available.');
}

export function canUseMeteredOverage(user: User): boolean {
    const source = effectiveBillingEntitlementSource(user);
    return user.billingSettings.allowOverage && (source === 'subscription' || source === 'lifetime') &&
        user.stripeSubscriptionStatus === 'active' && !hasBlockingBillingReview(user.billingReview) && !hasBlockingFinancialReview(user.billingAccount)
        && !Object.keys(user.stripePaymentIssues || {}).length && hasVerifiedMetering(user) &&
        (source !== 'lifetime' || user.lifetimeUsageSetup?.state === 'ready');
}

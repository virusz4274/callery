import type { User } from './db/types';
import type { AccessResult } from './access-control-types';
import { hasBillingIssue, isTrialExpired, isBillingEnabled, checkUserAccess, canUseMeteredOverage } from './access-control-common';
import { isFreeTrialPlanKey } from './plans';
import { getTranscriptionAllowanceUsed, hasUnlimitedTranscription } from './transcription/quota-policy';
import { effectiveBillingEntitlementSource } from './stripe/entitlement-source';

export function checkTranscriptionAccess(user: User, secondsToAdd: number): AccessResult {
    const account = checkUserAccess(user);
    if (!account.allowed) return account;
    if (!Number.isFinite(secondsToAdd) || secondsToAdd < 0) return { allowed: false, reason: 'Invalid transcription duration.' };

    if (!isBillingEnabled()) {
        return { allowed: true };
    }


    if (isTrialExpired(user)) {
        return {
            allowed: false,
            reason: 'Your free trial has expired. Please upgrade to continue transcribing.',
        };
    }

    const billingIssue = hasBillingIssue(user);
    if (billingIssue) {
        return billingIssue;
    }
    if (hasUnlimitedTranscription(user, true)) return { allowed: true };

    const currentUsage = getTranscriptionAllowanceUsed(user);
    const allocation = user.transcriptionAllocation;
    const newUsage = currentUsage + secondsToAdd;

    if (isFreeTrialPlanKey(user.planKey)) {
        if (newUsage > allocation) {
            const remaining = Math.max(0, allocation - currentUsage);
            return {
                allowed: false,
                reason: `Transcription limit exceeded for Free Trial. You have ${Math.floor(remaining / 60)} mins remaining.`,
            };
        }

        return { allowed: true };
    }

    const allowOverage = canUseMeteredOverage(user);
    if (!allowOverage && newUsage > allocation) {
        const remaining = Math.max(0, allocation - currentUsage);
        return {
            allowed: false,
            reason:
                remaining > 0
                    ? `Transcription limit exceeded. You have ${Math.floor(remaining / 60)} mins remaining.`
                    : effectiveBillingEntitlementSource(user) === 'admin'
                        ? 'Your administrator-provided transcription quota is exhausted. Contact your administrator.'
                        : `Transcription limit exceeded. Enable 'Pay Per Usage' in settings to transcribe more.`,
        };
    }

    return { allowed: true };
}

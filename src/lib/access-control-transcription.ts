import type { User } from './db/types';
import type { AccessResult } from './access-control-types';
import { hasBillingIssue, isTrialExpired, isBillingEnabled } from './access-control-common';
import { isFreeTrialPlanKey } from './plans';

export function checkTranscriptionAccess(user: User, secondsToAdd: number): AccessResult {
    if (user.disabled) {
        return { allowed: false, reason: 'Account disabled.' };
    }

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

    const currentUsage = user.transcriptionUsed;
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

    const allowOverage = user.billingSettings.allowOverage;
    if (!allowOverage && newUsage > allocation) {
        const remaining = Math.max(0, allocation - currentUsage);
        return {
            allowed: false,
            reason:
                remaining > 0
                    ? `Transcription limit exceeded. You have ${Math.floor(remaining / 60)} mins remaining.`
                    : `Transcription limit exceeded. Enable 'Pay Per Usage' in settings to transcribe more.`,
        };
    }

    return { allowed: true };
}

import type { User } from './db/types';
import type { AccessResult } from './access-control-types';
import { formatBytes } from './access-control-format';
import { hasBillingIssue, isTrialExpired, IS_BILLING_ENABLED } from './access-control-common';

export function checkStorageAccess(user: User, bytesToAdd: number): AccessResult {
    if (!IS_BILLING_ENABLED) {
        return { allowed: true };
    }

    if (user.disabled) {
        return { allowed: false, reason: 'Account disabled.' };
    }

    if (isTrialExpired(user)) {
        return {
            allowed: false,
            reason: 'Your free trial has expired. Please upgrade to continue uploading.',
        };
    }

    const billingIssue = hasBillingIssue(user);
    if (billingIssue) {
        return billingIssue;
    }

    const currentUsage = user.storageUsed || 0;
    const allocation = user.storageAllocation || 0;
    const newUsage = currentUsage + bytesToAdd;

    if (user.plan === 'Free Trial' || user.plan === 'Free') {
        if (newUsage > allocation) {
            return {
                allowed: false,
                reason: `Storage limit exceeded for Free Trial (${formatBytes(allocation)}). Please upgrade for unlimited storage.`,
            };
        }

        return { allowed: true };
    }

    const allowOverage = user.billingSettings?.allowOverage ?? false;
    if (!allowOverage && newUsage > allocation) {
        return {
            allowed: false,
            reason: `Storage limit exceeded (${formatBytes(allocation)}). Enable 'Pay Per Usage' in settings to upload more.`,
        };
    }

    return { allowed: true };
}

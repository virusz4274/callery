import { User } from './db/types';

/**
 * Result of an access check.
 */
export interface AccessResult {
    allowed: boolean;
    reason?: string;
}

/**
 * Check if a user's free trial has expired.
 */
export function isTrialExpired(user: User): boolean {
    if (user.plan !== 'Free Trial' && user.plan !== 'Free') {
        return false; // Paid plans don't expire in this sense (they might go past_due, handled by Stripe logic usually)
    }

    // If no trial end date, assume valid for legacy/safety, or expired?
    // Policy: "Free Trial Duration: 30 days from signup".
    // If missing, arguably we should allow or block. Let's respect the existing logic which allowed it.
    if (!user.trialEndsAt) {
        return false;
    }

    return new Date() > user.trialEndsAt;
}

/**
 * General access check (e.g. for logging in or viewing read-only data).
 * Currently just checks if the account is fundamentally banned or usable?
 * For now, this replaces the old checkUserAccess for BACKWARD COMPATIBILITY, 
 * but specific actions should use checkStorageAccess / checkTranscriptionAccess.
 */
export function checkUserAccess(user: User): AccessResult {
    // We do NOT block read-only access even if trial expired.
    // "Existing data remains readable but not actionable"
    // So general access should be allowed unless disabled by admin.

    if (user.disabled) {
        return { allowed: false, reason: 'Account disabled.' };
    }

    return { allowed: true };
}

/**
 * Check if user can upload a file of a given size.
 */
export function checkStorageAccess(user: User, bytesToAdd: number): AccessResult {
    if (user.disabled) {
        return { allowed: false, reason: 'Account disabled.' };
    }

    // 1. Check Trial Expiry
    if (isTrialExpired(user)) {
        return {
            allowed: false,
            reason: 'Your free trial has expired. Please upgrade to continue uploading.'
        };
    }

    // 2. Check Limits
    const currentUsage = user.storageUsed || 0;
    const allocation = user.storageAllocation || 0;
    const newUsage = currentUsage + bytesToAdd;

    // Plans: Free Trial, Paid (Monthly/Yearly), Lifetime

    if (user.plan === 'Lifetime') {
        // Lifetime: "No free storage... Every action is pay-per-use" -> Always allowed (metered)
        return { allowed: true };
    }

    if (user.plan === 'Free Trial' || user.plan === 'Free') {
        // Trial: "Storage limit (GB)... If user exceeds -> Block?"
        // Constraint: "Allowed during trial... After 30 days: User cannot upload"
        // Implied: During trial, they HAVE a limit (Allocation).
        // Do we block if they exceed allocation DURING trial?
        // "If user exceeds... usage becomes metered... Do NOT hard-block usage... allow overage"
        // This rule ("Paid Plans... Rules") specifically falls under "2. Paid Plans" section.
        // "1. Free Trial" section only says "Allowed during trial... After 30 days... X".
        // It doesn't explicitly say "Hard block on storage limit".
        // BUT usually trials have hard limits to prevent abuse.
        // I will enforce HARD LIMIT for Free Trial to be safe.
        if (newUsage > allocation) {
            return {
                allowed: false,
                reason: `Storage limit exceeded for Free Trial (${formatBytes(allocation)}). Please upgrade for unlimited storage.`
            };
        }
    } else {
        // Paid Plans: "Do NOT hard-block usage after limit; allow overage"
        // LOGIC (Toggle):
        // If allowOverage is TRUE -> Allow (Metered).
        // If allowOverage is FALSE -> Block (Hard Limit).

        // Default to FALSE if missing (strict mode)
        const allowOverage = user.billingSettings?.allowOverage ?? false;

        if (!allowOverage && newUsage > allocation) {
            return {
                allowed: false,
                reason: `Storage limit exceeded (${formatBytes(allocation)}). Enable 'Pay Per Usage' in settings to upload more.`
            };
        }

        return { allowed: true };
    }

    return { allowed: true };
}

/**
 * Check if user can transcribe audio of a given duration (in seconds).
 */
export function checkTranscriptionAccess(user: User, secondsToAdd: number): AccessResult {
    if (user.disabled) {
        return { allowed: false, reason: 'Account disabled.' };
    }

    // 1. Check Trial Expiry
    if (isTrialExpired(user)) {
        return {
            allowed: false,
            reason: 'Your free trial has expired. Please upgrade to continue transcribing.'
        };
    }

    // 2. Check Limits
    const currentUsage = user.transcriptionUsed || 0;
    const allocation = user.transcriptionAllocation || 0;
    const newUsage = currentUsage + secondsToAdd;

    if (user.plan === 'Lifetime') {
        // Lifetime: Pay-per-use, always allowed
        return { allowed: true };
    }

    if (user.plan === 'Free Trial' || user.plan === 'Free') {
        // Trial: Enforce HARD LIMIT to prevent abuse
        if (newUsage > allocation) {
            const remaining = Math.max(0, allocation - currentUsage);
            const mins = Math.floor(remaining / 60);
            return {
                allowed: false,
                reason: `Transcription limit exceeded for Free Trial. You have ${mins} mins remaining.`
            };
        }
    } else {
        // Paid Plans: Check Toggle
        const allowOverage = user.billingSettings?.allowOverage ?? false;

        if (!allowOverage && newUsage > allocation) {
            const remaining = Math.max(0, allocation - currentUsage);
            const mins = Math.floor(remaining / 60);
            const reason = remaining > 0
                ? `Transcription limit exceeded. You have ${mins} mins remaining.`
                : `Transcription limit exceeded. Enable 'Pay Per Usage' in settings to transcribe more.`;

            return {
                allowed: false,
                reason
            };
        }

        return { allowed: true };
    }

    return { allowed: true };
}

// Helper
function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

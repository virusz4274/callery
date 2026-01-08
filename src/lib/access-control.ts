import { User } from './db/types';

/**
 * Check if a user has access to premium features (upload, transcribe).
 * Access is denied if the user is on the "Free" plan (or default) and their trial has expired.
 * Paid plans (Pro, Enterprise, etc.) are always allowed (subject to other limits).
 */
export function checkUserAccess(user: User): { allowed: boolean; reason?: string } {
    // If plan is NOT Free, assume they are paying (or manually upgraded)
    // Adjust 'Free' to match your exact default plan name in usage
    if (user.plan !== 'Free' && user.plan !== 'Free Trial') {
        return { allowed: true };
    }

    // If no trial date is set, we might fallback to "allowed" or "blocked" depending on policy.
    // For now, if missing trial date on Free plan, we can assume it's an old user or allowed.
    // However, goal is 30-day trial. If we want to strictly enforce, we'd block if missing.
    // Let's allow if missing for backward compatibility unless specified otherwise.
    if (!user.trialEndsAt) {
        return { allowed: true }; // Legacy users or users created before this change
    }

    const now = new Date();
    if (now > user.trialEndsAt) {
        return {
            allowed: false,
            reason: 'Your free trial has expired. Please upgrade to continue uploading and transcribing.'
        };
    }

    return { allowed: true };
}

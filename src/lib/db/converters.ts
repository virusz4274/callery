import { processingProgress } from '@/lib/transcription/progress';
/**
 * @fileoverview Database document to API response converters.
 * 
 * These functions transform MongoDB documents (with ObjectId and Date objects)
 * into API response objects suitable for JSON serialization.
 * 
 * @module lib/db/converters
 */

import type { Recording, RecordingResponse, Contact, ContactResponse, User, UserResponse } from './types';
import { hasStoredGoogleRefreshToken } from '@/services/google/refresh-token-crypto';
import { hasBillingIssue, isBillingEnabled, isTrialExpired } from '@/lib/access-control-common';
import { hasBlockingBillingReview } from '@/lib/stripe/financial-review';
import { effectiveBillingEntitlementSource } from '@/lib/stripe/entitlement-source';
import { getTranscriptionAllowanceUsed, hasUnlimitedTranscription } from '@/lib/transcription/quota-policy';

// ============================================================================
// Recording Converters
// ============================================================================

/**
 * Convert a Recording MongoDB document to API response format.
 * 
 * Transforms:
 * - `_id` (ObjectId) → `id` (string)
 * - `contactId` (ObjectId | null) → string | null
 * - Date fields → ISO string format
 * 
 * @param recording - The MongoDB Recording document
 * @param playbackUrl - Optional signed URL for audio playback
 * @returns RecordingResponse suitable for JSON serialization
 * 
 * @example
 * ```typescript
 * const recording = await getRecordingById(id, uid);
 * const response = toRecordingResponse(recording, await getSignedUrl(recording.r2Key));
 * ```
 */
export function toRecordingResponse(recording: Recording, playbackUrl?: string): RecordingResponse {
    return {
        id: recording._id.toString(),
        authSubject: recording.authSubject,
        contactId: recording.contactId?.toString() || null,
        contactName: recording.contactName,
        phoneNumber: recording.phoneNumber,
        r2Key: recording.r2Key,
        fileName: recording.fileName,
        standardizedDisplayName: recording.standardizedDisplayName,
        fileSize: recording.fileSize,
        mimeType: recording.mimeType,
        duration: recording.duration,
        recordedAt: recording.recordedAt.toISOString(),
        bulkImportId: recording.bulkImportId,
        transcriptionBatchId: recording.transcriptionBatchId,
        recordingDateKey: recording.recordingDateKey,
        createdAt: recording.createdAt.toISOString(),
        updatedAt: recording.updatedAt.toISOString(),
        transcriptionStatus: recording.transcriptionStatus,
        processingStatus: recording.processingStatus,
        processingProgress: processingProgress(recording),
        fullTranscript: recording.fullTranscript,
        languageCode: recording.languageCode,
        transcriptionProvider: recording.transcriptionProvider,
        transcriptionModel: recording.transcriptionModel,
        transcriptionCostMultiplier: recording.transcriptionCostMultiplier,
        summary: recording.summary,
        tags: recording.tags,
        isStarred: recording.isStarred,
        isArchived: recording.isArchived,
        playbackUrl,
    };
}

// ============================================================================
// Contact Converters
// ============================================================================

/**
 * Convert a Contact MongoDB document to API response format.
 * 
 * @param contact - The MongoDB Contact document
 * @returns ContactResponse suitable for JSON serialization
 */
export function toContactResponse(contact: Contact): ContactResponse {
    return {
        id: contact._id.toString(),
        authSubject: contact.authSubject,
        googleContactId: contact.googleContactId,
        name: contact.name,
        phoneNumbers: contact.phoneNumbers,
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        jobTitle: contact.jobTitle,
        company: contact.company,
        createdAt: contact.createdAt.toISOString(),
        updatedAt: contact.updatedAt.toISOString(),
        totalRecordings: contact.totalRecordings,
        lastRecordingAt: contact.lastRecordingAt?.toISOString() || null,
    };
}

// ============================================================================
// User Converters
// ============================================================================

/**
 * Convert a User MongoDB document to API response format.
 * 
 * @param user - The MongoDB User document
 * @returns UserResponse suitable for JSON serialization
 */
export function toUserResponse(user: User, planName: string): UserResponse {
    const entitlement = effectiveBillingEntitlementSource(user);
    return {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.name,
        phoneNumber: user.phoneNumber,
        role: user.role,
        planKey: user.planKey,
        planName,
        timezone: user.timezone,
        createdAt: user.createdAt.toISOString(),
        notificationSettings: user.notificationSettings,
        storageSettings: user.storageSettings,
        storageUsed: user.storageUsed,
        storageAllocation: user.storageAllocation,
        transcriptionUsed: user.transcriptionUsed,
        transcriptionAllowanceUsed: getTranscriptionAllowanceUsed(user),
        transcriptionAllocation: user.transcriptionAllocation,
        transcriptionUnlimited: hasUnlimitedTranscription(user, isBillingEnabled()),
        transcriptionSettings: user.transcriptionSettings,
        billingSettings: user.billingSettings,
        stripeSubscriptionStatus: user.stripeSubscriptionStatus,
        billingStatus: {
            recoveryDeadline: user.billingRecovery?.purgeAt.toISOString(),
            entitlement: hasBlockingBillingReview(user.billingReview) ? 'review' : entitlement || (user.planKey === 'free-trial' ? 'trial' : 'review'),
            lifetimePurchased: Boolean(user.lifetimePurchase),
            usageSetup: user.lifetimeUsageSetup?.state,
            canManageBilling: Boolean(user.stripeCustomerId && (entitlement !== 'admin' || user.stripeSubscriptionId)),
            needsAttention: isBillingEnabled() && Boolean(hasBillingIssue(user) || isTrialExpired(user)),
        },
        trialEndsAt: user.trialEndsAt?.toISOString(),
        totalRecordings: user.totalRecordings,
        lastLoginAt: user.lastLoginAt?.toISOString(),
        googleSync: {
            status: user.googleSync.status,
            connectedAt: user.googleSync.connectedAt?.toISOString(),
            lastAttemptAt: user.googleSync.lastAttemptAt?.toISOString(),
            lastSyncedAt: user.googleSync.lastSyncedAt?.toISOString(),
            lastError: user.googleSync.lastError || null,
            lastImportedCount: user.googleSync.lastImportedCount,
            hasRefreshToken: hasStoredGoogleRefreshToken(user.googleSync),
            scopes: user.googleSync.scopes,
            tokenExpiresAt: user.googleSync.tokenExpiresAt?.toISOString(),
            duplicatePhoneIssueCount: user.googleSync.duplicatePhoneIssueCount,
            duplicatePhoneIssues: user.googleSync.duplicatePhoneIssues,
            duplicatePhoneIssueDetectedAt: user.googleSync.duplicatePhoneIssueDetectedAt?.toISOString(),
        },
    };
}

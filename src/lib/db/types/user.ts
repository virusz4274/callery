import { ObjectId } from 'mongodb';
import type { BillingEntitlement, LifetimePurchase, LifetimeUsageSetup, StripeMetering, PendingCheckout, BillingLease, BillingReview, StripePaymentIssue, UsageBillingBootstrap, BillingOperationSummary, AutomaticTopupSettings } from '@/lib/stripe/billing-types';

/**
 * Push Subscription entry for storing in User document.
 */
export interface PushSubscriptionEntry {
    type: 'web'; // Future: 'fcm' for Android
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
    userAgent?: string;
    createdAt: Date;
}

export interface GoogleSyncDuplicatePhoneIssue {
    phoneNumber: string;
    names: string[];
}

/**
 * User document stored in MongoDB.
 * Links to Better Auth via authSubject.
 */
export interface User {
    billingAccount?: import('@/lib/stripe/ledger').BillingAccount;
    billingRecovery?: { startedAt: Date; purgeAt: Date; warnings: number[]; purgingAt?: Date; purgedAt?: Date; exportJobId?: string };
    billingRecoveryCheckedAt?: Date;
    _id: ObjectId;
    authSubject: string;
    email: string;
    firstName: string;
    lastName: string;
    name: string;
    phoneNumber: string;
    photoURL?: string;
    createdAt: Date;
    updatedAt: Date;
    role: 'user' | 'admin';
    planKey: string;
    disabled?: boolean;
    teamInvitationPending?: boolean;
    accessRevokedAt?: Date;
    timezone: string;
    notificationSettings: {
        activityDigest: 'off' | 'weekly' | 'monthly';
    };
    transcriptionSettings: {
        autoTranscribe: boolean;
        defaultProvider?: 'soniox' | 'elevenlabs' | 'gemini' | 'openai_compat';
        defaultModel?: string;
    };
    storageSettings: {
        deletionPolicy: 'never' | '3m' | '6m' | '1y';
    };
    storageUsed: number;
    /** Atomic reservations and completion receipts shared by all upload clients. */
    uploadReservations?: Record<string, number>;
    uploadReceipts?: Record<string, Date>;
    transcriptionReceipts?: Record<string, Date>;
    storageAllocation: number;
    storagePeakUsed: number;
    storagePeakPeriodEnd?: Date | null;
    transcriptionUsed: number;
    transcriptionAllocation: number;
    totalContacts: number;
    totalRecordings: number;

    totalDuration: number;

    // Billing Settings
    billingSettings: {
        allowOverage: boolean;
    };

    // Stripe Subscription Fields
    billingEntitlement?: BillingEntitlement;
    lifetimePurchase?: LifetimePurchase;
    lifetimeUsageSetup?: LifetimeUsageSetup;
    stripeMetering?: StripeMetering;
    pendingCheckout?: PendingCheckout;
    stripeBillingLease?: BillingLease;
    billingReview?: BillingReview;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    stripePriceId?: string;
    stripeSubscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'paused';
    stripeCurrentPeriodEnd?: Date;
    stripeCurrentPeriodStart?: Date;
    stripeSyncedAt?: Date;
    stripePaymentIssues?: Record<string, StripePaymentIssue>;
    usageBillingBootstrap?: UsageBillingBootstrap;
    billingOperation?: BillingOperationSummary;
    billingLastAppliedOperationId?: string;
    billingCatalogVersion?: string;
    /** Current published usage terms; the original purchase catalog remains archived separately. */
    billingUsageCatalogVersion?: string;
    billingUsageTariffs?: import('@/lib/stripe/usage-tariff').UsageTariffPair;
    billingGrantTransfer?: { operationId: string; startedAt: Date; reason: string };
    billingUsagePriceRollout?: { id: string; state: string; effectiveAt?: Date; targetBundleId: string; noticedAt?: Date };
    billingSchedule?: import('@/lib/stripe/billing-types').BillingScheduleSummary;
    billingPaidBasePeriod?: import('@/lib/stripe/billing-types').PaidBasePeriod;
    automaticTopup?: AutomaticTopupSettings;
    stripeBasePeriodStart?: Date;
    stripeBasePeriodEnd?: Date;
    stripeCustomerGeneration?: number;

    // Trial
    trialEndsAt?: Date;

    // Login tracking
    lastLoginAt?: Date;

    // Push Notification Subscriptions
    pushSubscriptions?: PushSubscriptionEntry[];

    // Google Contacts integration state
    googleSync: {
        status: 'not_connected' | 'syncing' | 'completed' | 'failed';
        connectedAt?: Date;
        lastAttemptAt?: Date;
        lastSyncedAt?: Date;
        lastError?: string | null;
        lastImportedCount?: number;
        refreshTokenCiphertext?: string;
        refreshTokenKeyVersion?: string;
        scopes?: string[];
        tokenExpiresAt?: Date;
        duplicatePhoneIssueCount?: number;
        duplicatePhoneIssues?: GoogleSyncDuplicatePhoneIssue[];
        duplicatePhoneIssueDetectedAt?: Date;
    };

    // Soft deletion lifecycle
    softDelete?: {
        isDeleted: boolean;
        deletedAt: Date;
        restoreUntil: Date;
        previousDisabled: boolean;
        deletedByAdminId?: string;
    };
}

export type CreateUserInput = Omit<User, '_id' | 'createdAt' | 'updatedAt'>;
export type UpdateUserInput = Partial<Omit<User, '_id' | 'authSubject' | 'createdAt'>>;

/**
 * User response for frontend/API usage.
 * String dates and id for JSON serialization.
 */
export interface UserResponse {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    name: string;
    phoneNumber: string;
    photoURL?: string;
    role: 'user' | 'admin';
    planKey: string;
    planName: string;
    disabled?: boolean;
    timezone: string;
    createdAt: string;
    notificationSettings: {
        activityDigest: 'off' | 'weekly' | 'monthly';
    };
    storageSettings: {
        deletionPolicy: 'never' | '3m' | '6m' | '1y';
    };
    storageUsed: number;
    storageAllocation: number;
    transcriptionUsed: number;
    /** Successful included allowance only; total weighted usage stays separate. */
    transcriptionAllowanceUsed?: number;
    transcriptionAllocation: number;
    /** Derived for administrator-funded Internal access; never a metering authority. */
    transcriptionUnlimited?: boolean;
    transcriptionSettings: {
        autoTranscribe: boolean;
        defaultProvider?: 'soniox' | 'elevenlabs' | 'gemini' | 'openai_compat';
        defaultModel?: string;
    };
    billingSettings: {
        allowOverage: boolean;
    };
    stripeSubscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'paused';
    billingStatus?: {
        recoveryDeadline?: string;
        entitlement: BillingEntitlement['source'] | 'review';
        lifetimePurchased: boolean;
        usageSetup?: LifetimeUsageSetup['state'];
        needsAttention: boolean;
        canManageBilling: boolean;
    };
    trialEndsAt?: string;
    totalRecordings: number;
    lastLoginAt?: string;
    softDelete?: {
        isDeleted: boolean;
        deletedAt: string;
        restoreUntil: string;
        previousDisabled: boolean;
        deletedByAdminId?: string;
    };
    googleSync: {
        status: 'not_connected' | 'syncing' | 'completed' | 'failed';
        connectedAt?: string;
        lastAttemptAt?: string;
        lastSyncedAt?: string;
        lastError?: string | null;
        lastImportedCount?: number;
        hasRefreshToken: boolean;
        scopes?: string[];
        tokenExpiresAt?: string;
        duplicatePhoneIssueCount?: number;
        duplicatePhoneIssues?: GoogleSyncDuplicatePhoneIssue[];
        duplicatePhoneIssueDetectedAt?: string;
    };
}

import { ObjectId } from 'mongodb';

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

/**
 * User document stored in MongoDB.
 * Links to Firebase Auth via firebaseUid.
 */
export interface User {
    _id: ObjectId;
    firebaseUid: string;
    email: string;
    firstName: string;
    lastName: string;
    name: string;
    phoneNumber: string;
    photoURL?: string;
    createdAt: Date;
    updatedAt: Date;
    role: 'user' | 'admin';
    plan: string; // Dynamic plan name (e.g. "Free", "Pro", "Enterprise")
    disabled?: boolean;
    timezone: string;
    notificationSettings: {
        activityDigest: 'off' | 'weekly' | 'monthly';
        ingestSuccess: boolean;
        ingestFail: boolean;
    };
    transcriptionSettings: {
        autoTranscribe: boolean;
        defaultProvider?: 'soniox' | 'elevenlabs';
        defaultModel?: string;
    };
    storageSettings: {
        deletionPolicy: 'never' | '3m' | '6m' | '1y';
    };
    storageUsed: number;
    storageAllocation: number;
    storagePeakUsed?: number;
    storagePeakPeriodEnd?: Date;
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
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    stripePriceId?: string;
    stripeSubscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'paused';
    stripeCurrentPeriodEnd?: Date;

    // Trial
    trialEndsAt?: Date;

    // Login tracking
    lastLoginAt?: Date;

    // Push Notification Subscriptions
    pushSubscriptions?: PushSubscriptionEntry[];

    // Google Contacts integration state
    googleSync?: {
        status: 'not_connected' | 'syncing' | 'completed' | 'failed';
        connectedAt?: Date;
        lastAttemptAt?: Date;
        lastSyncedAt?: Date;
        lastError?: string | null;
        lastImportedCount?: number;
        refreshToken?: string; // Legacy plaintext token kept only for migration.
        refreshTokenCiphertext?: string;
        refreshTokenKeyVersion?: string;
        scopes?: string[];
        tokenExpiresAt?: Date;
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
export type UpdateUserInput = Partial<Omit<User, '_id' | 'firebaseUid' | 'createdAt'>>;

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
    plan: string;
    disabled?: boolean;
    timezone: string;
    createdAt: string;
    notificationSettings: {
        activityDigest: 'off' | 'weekly' | 'monthly';
        ingestSuccess: boolean;
        ingestFail: boolean;
    };
    storageSettings: {
        deletionPolicy: 'never' | '3m' | '6m' | '1y';
    };
    storageUsed: number;
    storageAllocation: number;
    transcriptionUsed: number;
    transcriptionAllocation: number;
    transcriptionSettings: {
        autoTranscribe: boolean;
        defaultProvider?: 'soniox' | 'elevenlabs';
        defaultModel?: string;
    };
    billingSettings: {
        allowOverage: boolean;
    };
    stripeSubscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'paused';
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
    googleSync?: {
        status: 'not_connected' | 'syncing' | 'completed' | 'failed';
        connectedAt?: string;
        lastAttemptAt?: string;
        lastSyncedAt?: string;
        lastError?: string | null;
        lastImportedCount?: number;
        hasRefreshToken: boolean;
        scopes?: string[];
        tokenExpiresAt?: string;
    };
}

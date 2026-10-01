import { ObjectId } from 'mongodb';
import type { TranscriptionProvider } from '../config';

/**
 * User document stored in MongoDB.
 * Links to Firebase Auth via authSubject.
 */
export interface User {
    _id: ObjectId;
    authSubject: string;
    authProvider: 'firebase' | 'local';
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
        /** Per-user provider override. Absent = instance TRANSCRIPTION_PROVIDER default. */
        provider?: TranscriptionProvider;
    };
    storageSettings: {
        deletionPolicy: 'never' | '3m' | '6m' | '1y';
    };
    storageUsed: number;
    storageAllocation: number;
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
}

/**
 * Recording document stored in MongoDB.
 */
export interface Recording {
    _id: ObjectId;
    authSubject: string;
    contactId: ObjectId | null;
    contactName: string | null;
    phoneNumber: string;

    // File metadata
    r2Key: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    duration: number;

    // Additional file metadata (new)

    standardizedDisplayName?: string; // Cached display name for UI

    // Timestamps
    recordedAt: Date;
    createdAt: Date;
    updatedAt: Date;

    // Transcription
    transcriptionStatus: 'pending' | 'processing' | 'completed' | 'failed';
    fullTranscript?: TranscriptionSegment[]; // Structured transcript with diarization
    languageCode?: string; // e.g. 'mal', 'eng'

    // Future-proof fields for translations/transliterations
    transliteratedTranscript?: string; // e.g., Manglish
    translatedTranscript?: string; // e.g., English translation
    additionalTranscriptions?: Record<string, string>; // Flexible bucket for other variations

    // Summary & Embeddings
    summary?: string; // English summary for search
    summaryEmbedding?: number[]; // Vector embedding of the summary
    transcriptEmbedding?: number[]; // Deprecated?

    // Metadata
    tags: string[];
    isStarred: boolean;
    isArchived: boolean;
}

/**
 * Contact document stored in MongoDB.
 */
export interface Contact {
    _id: ObjectId;
    authSubject: string;
    googleContactId?: string;
    name: string;
    phoneNumbers: string[];

    email: string;
    firstName: string;
    lastName: string;
    jobTitle?: string;
    company?: string;
    createdAt: Date;
    updatedAt: Date;

    // Stats
    totalRecordings: number;
    lastRecordingAt: Date | null;
}

/**
 * Plan document stored in MongoDB.
 */
export interface Plan {
    _id: ObjectId;
    name: string;
    description?: string;
    stripePriceId: string; // ID of the Price in Stripe (e.g., price_H5ggY...)
    stripeStoragePriceId?: string; // ID for Metered Storage
    stripeTranscriptionPriceId?: string; // ID for Metered Transcription
    price: number;
    currency: string;
    interval: 'monthly' | 'yearly' | 'lifetime';
    limits: {
        storage: number; // in bytes
        transcription: number; // in seconds
    };
    features: string[];
    isDefault: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * System Settings document (Singleton).
 */
export interface SystemSettings {
    _id: ObjectId;
    allowSignups: boolean;
    maintenanceMode: boolean;
    defaultPlanId?: ObjectId; // Optional reference to the default plan
    updatedAt: Date;
}

/**
 * Announcement document.
 */
export interface Announcement {
    _id: ObjectId;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'alert' | 'success';
    isActive: boolean;
    startDate: Date;
    endDate?: Date;
    createdAt: Date;
    createdBy: ObjectId; // Admin ID
}

/**
 * Audit Log document.
 */
export interface AdminLog {
    _id: ObjectId;
    adminId: string;      // ID of the admin who performed the action
    adminEmail: string;   // Cached email for easier display
    action: string;       // e.g., "USER_BAN", "PLAN_UPDATE", "SETTINGS_CHANGE"
    targetId?: string;    // ID of the affected resource (User ID, Plan ID)
    targetType?: string;  // "USER", "PLAN", "SYSTEM", "ANNOUNCEMENT"
    details: Record<string, unknown>; // Snapshot of changes (before/after or just args)
    ipAddress?: string;   // Optional security field
    createdAt: Date;
}

// Input types for creating new documents (without _id and timestamps)

export type CreateUserInput = Omit<User, '_id' | 'createdAt' | 'updatedAt'>;
export type UpdateUserInput = Partial<Omit<User, '_id' | 'authSubject' | 'authProvider' | 'createdAt'>>;

export type CreateRecordingInput = Omit<Recording, '_id' | 'createdAt' | 'updatedAt'>;
export type UpdateRecordingInput = Partial<Omit<Recording, '_id' | 'authSubject' | 'createdAt'>>;

export type CreateContactInput = Omit<Contact, '_id' | 'createdAt' | 'updatedAt'>;
export type UpdateContactInput = Partial<Omit<Contact, '_id' | 'authSubject' | 'createdAt'>>;

export type CreatePlanInput = Omit<Plan, '_id' | 'createdAt' | 'updatedAt'>;
export type UpdatePlanInput = Partial<Omit<Plan, '_id' | 'createdAt' | 'updatedAt'>>;

export type UpdateSystemSettingsInput = Partial<Omit<SystemSettings, '_id' | 'updatedAt' | 'defaultPlanId'>> & {
    /** Hex string from the admin UI; the action converts it to an ObjectId. */
    defaultPlanId?: string;
};

export type CreateAnnouncementInput = Omit<Announcement, '_id' | 'createdAt' | 'createdBy'>;
export type UpdateAnnouncementInput = Partial<Omit<Announcement, '_id' | 'createdAt' | 'createdBy'>>;

// API response types (with string _id for JSON serialization)

export interface RecordingResponse {
    id: string;
    authSubject: string;
    contactId: string | null;
    contactName: string | null;
    phoneNumber: string;
    r2Key: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    duration: number;
    recordedAt: string;
    createdAt: string;
    updatedAt: string;
    transcriptionStatus: 'pending' | 'processing' | 'completed' | 'failed';
    fullTranscript?: TranscriptionSegment[];
    languageCode?: string;
    summary?: string;
    tags: string[];
    isStarred: boolean;
    isArchived: boolean;
    /** Signed URL for playback (generated on request) */
    playbackUrl?: string;
}

export interface ContactResponse {
    id: string;
    authSubject: string;
    googleContactId?: string;
    name: string;
    phoneNumbers: string[];
    email: string | null;
    firstName: string;
    lastName: string;
    jobTitle?: string;
    company?: string;
    createdAt: string;
    updatedAt: string;
    totalRecordings: number;
    lastRecordingAt: string | null;
}

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
        /** Per-user provider override. Absent = instance TRANSCRIPTION_PROVIDER default. */
        provider?: TranscriptionProvider;
    };
    billingSettings: {
        allowOverage: boolean;
    };
    stripeSubscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'paused';
    trialEndsAt?: string;
    totalRecordings: number;
    lastLoginAt?: string;
}

export interface PlanResponse {
    id: string;
    name: string;
    description?: string;
    stripePriceId: string;
    stripeStoragePriceId?: string;
    stripeTranscriptionPriceId?: string;
    price: number;
    currency: string;
    interval: 'monthly' | 'yearly' | 'lifetime';
    limits: {
        storage: number;
        transcription: number;
    };
    features: string[];
    isDefault: boolean;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface SystemSettingsResponse {
    id: string;
    allowSignups: boolean;
    maintenanceMode: boolean;
    defaultPlanId?: string;
    updatedAt: string;
}

export interface AnnouncementResponse {
    id: string;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'alert' | 'success';
    isActive: boolean;
    startDate: string;
    endDate?: string;
    createdAt: string;
}

export interface AdminLogResponse {
    id: string;
    adminId: string;
    adminEmail: string;
    action: string;
    targetId?: string;
    targetType?: string;
    details: Record<string, unknown>;
    createdAt: string;
}

export interface TranscriptionWord {
    text: string;
    start?: number;  // in seconds
    end?: number;    // in seconds
    speakerId?: string;
    confidence?: number;  // Soniox confidence score (0-1)
}

export interface TranscriptionSegment {
    speakerId: string;
    text: string;
    start?: number;
    end?: number;
    words: TranscriptionWord[];
    transliteratedText?: string;
}

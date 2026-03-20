/**
 * Application constants - single source of truth for magic strings.
 */

// ============================================================================
// Transcription
// ============================================================================

export const TRANSCRIPTION_STATUS = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
} as const;

export type TranscriptionStatus = typeof TRANSCRIPTION_STATUS[keyof typeof TRANSCRIPTION_STATUS];

// ============================================================================
// User Roles
// ============================================================================

export const USER_ROLE = {
    USER: 'user',
    ADMIN: 'admin',
} as const;

export type UserRole = typeof USER_ROLE[keyof typeof USER_ROLE];

// Storage & Data Policies
// ============================================================================

export const DELETION_POLICY = {
    NEVER: 'never',
    THREE_MONTHS: '3m',
    SIX_MONTHS: '6m',
    ONE_YEAR: '1y',
} as const;

export type DeletionPolicy = typeof DELETION_POLICY[keyof typeof DELETION_POLICY];

export const ACTIVITY_DIGEST = {
    OFF: 'off',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
} as const;

export type ActivityDigest = typeof ACTIVITY_DIGEST[keyof typeof ACTIVITY_DIGEST];

// ============================================================================
// Invoice
// ============================================================================

export const INVOICE_STATUS = {
    PAID: 'Paid',
    PENDING: 'Pending',
    FAILED: 'Failed',
} as const;

export type InvoiceStatus = typeof INVOICE_STATUS[keyof typeof INVOICE_STATUS];

// ============================================================================
// Pagination
// ============================================================================

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

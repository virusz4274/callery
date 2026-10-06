import { ObjectId } from 'mongodb';

/**
 * System Settings document (Singleton).
 */
export interface SystemSettings {
    _id: ObjectId;
    allowSignups: boolean;
    maintenanceMode: boolean;
    defaultPlanId: ObjectId;
    transcriptionMultipliers?: {
        soniox: number;
        elevenlabs: number;
        gemini?: number;
        openai_compat?: number;
    };
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
 * In-App Notification document.
 */
export interface Notification {
    _id: ObjectId;
    userId: ObjectId;
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message: string;
    isRead: boolean;
    link?: string;
    createdAt: Date;
}

export type ExternalServiceIncidentErrorKind =
    | 'quota'
    | 'auth'
    | 'rate_limit'
    | 'network'
    | 'timeout'
    | 'upstream_5xx'
    | 'validation'
    | 'unknown';

export type ExternalServiceIncidentSeverity = 'degraded' | 'down';

export type ExternalServiceIncidentStatus = 'open' | 'resolved' | 'stale';

export interface ExternalServiceIncident {
    _id: ObjectId;
    provider: string;
    service: string;
    operation: string;
    errorKind: ExternalServiceIncidentErrorKind;
    severity: ExternalServiceIncidentSeverity;
    status: ExternalServiceIncidentStatus;
    retryable: boolean;
    httpStatus?: number;
    dedupeKey: string;
    message: string;
    firstSeenAt: Date;
    lastSeenAt: Date;
    occurrenceCount: number;
    cooldownUntil: Date;
    monitoringEventId?: string;
    sampleContext?: Record<string, unknown>;
    resolvedAt?: Date;
    staleAt?: Date;
    createdAt: Date;
    updatedAt: Date;
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

/**
 * Export Job document.
 */
export interface ExportJob {
    _id: ObjectId;
    authSubject: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number; // 0-100
    totalRecordings: number;
    processedRecordings: number;
    parts: {
        url: string; // R2 Signed URL (or public if bucket is public, likely signed)
        size: number;
        expiresAt: Date;
        key: string; // R2 Key
    }[];
    checkpoint: {
        cursorRecordedAt?: Date;
        cursorId?: string;
        nextPartNumber: number;
    };
    error?: string;
    createdAt: Date;
    updatedAt: Date;
    startedAt?: Date;
    completedAt?: Date;
}

export interface RateLimitBucket {
    _id: string;
    count: number;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export type UpdateSystemSettingsInput = Partial<Omit<SystemSettings, '_id' | 'updatedAt'>>;

export type CreateAnnouncementInput = Omit<Announcement, '_id' | 'createdAt' | 'createdBy'>;
export type UpdateAnnouncementInput = Partial<Omit<Announcement, '_id' | 'createdAt' | 'createdBy'>>;

export type CreateNotificationInput = Omit<Notification, '_id' | 'createdAt'>;

export type CreateExportJobInput = Omit<ExportJob, '_id' | 'createdAt' | 'updatedAt'>;

export interface SystemSettingsResponse {
    id: string;
    allowSignups: boolean;
    maintenanceMode: boolean;
    defaultPlanId: string;
    transcriptionMultipliers?: {
        soniox: number;
        elevenlabs: number;
        gemini?: number;
        openai_compat?: number;
    };
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

export interface NotificationResponse {
    id: string;
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message: string;
    isRead: boolean;
    link?: string;
    createdAt: string;
}

export interface ExternalServiceIncidentResponse {
    id: string;
    provider: string;
    service: string;
    operation: string;
    errorKind: ExternalServiceIncidentErrorKind;
    severity: ExternalServiceIncidentSeverity;
    status: ExternalServiceIncidentStatus;
    retryable: boolean;
    httpStatus?: number;
    dedupeKey: string;
    message: string;
    firstSeenAt: string;
    lastSeenAt: string;
    occurrenceCount: number;
    cooldownUntil: string;
    monitoringEventId?: string;
    sampleContext?: Record<string, unknown>;
    resolvedAt?: string;
    staleAt?: string;
    createdAt: string;
    updatedAt: string;
}

export interface AdminLogResponse {
    id: string;
    adminId: string;
    adminEmail: string;
    action: string;
    details: Record<string, unknown>;
    targetId?: string;
    targetType?: string;
    createdAt: string;
}

export interface ExportJobResponse {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    parts: {
        url: string;
        expiresAt: string;
    }[];
    error?: string;
    createdAt: string;
    completedAt?: string;
}

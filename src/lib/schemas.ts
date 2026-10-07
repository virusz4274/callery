import { z } from 'zod';

export const GetRecordingsOptionsSchema = z.object({
    limit: z.number().min(1).max(100).optional().default(100),
    page: z.number().min(1).optional().default(1),
    includeArchived: z.boolean().optional(),
    needsTranscription: z.boolean().optional(),
    search: z.string().optional(),
    contactName: z.string().optional(),
    contactId: z.string().optional(),
    sortBy: z.enum(['date', 'duration']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    startDate: z.string().optional(), // ISO date string
    endDate: z.string().optional(),   // ISO date string
});

export const UpdateRecordingSchema = z.object({
    isStarred: z.boolean().optional(),
    isArchived: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    contactName: z.string().optional(),
    contactId: z.string().optional(),
});

export const RecordingIdSchema = z.string().min(1, "Recording ID is required");

export type GetRecordingsOptionsInput = z.input<typeof GetRecordingsOptionsSchema>;
export type UpdateRecordingInput = z.input<typeof UpdateRecordingSchema>;

// --- User profile / display name ---

const DisplayNameField = z.string().trim().min(1).max(100);
const OptionalDisplayNameField = DisplayNameField.optional();

export const EnsureProfileBodySchema = z.object({
    displayName: OptionalDisplayNameField,
    firstName: OptionalDisplayNameField,
    lastName: OptionalDisplayNameField,
    photoURL: z.string().url().max(2048).optional(),
});

export const NotificationSettingsSchema = z.object({
    activityDigest: z.enum(['off', 'weekly', 'monthly']),
    ingestSuccess: z.boolean(),
    ingestFail: z.boolean(),
});

export const TranscriptionSettingsSchema = z.object({
    autoTranscribe: z.boolean(),
    defaultProvider: z.enum(['soniox', 'elevenlabs', 'gemini', 'openai_compat']).optional(),
    defaultModel: z.string().max(100).optional(),
});

export const StorageSettingsSchema = z.object({
    deletionPolicy: z.enum(['never', '3m', '6m', '1y']),
});

export const UpdateProfileBodySchema = z.object({
    firstName: OptionalDisplayNameField,
    lastName: OptionalDisplayNameField,
    phoneNumber: z.string().trim().max(40).optional(),
    timezone: z.string().trim().max(80).optional(),
    notificationSettings: NotificationSettingsSchema.partial().optional(),
    storageSettings: StorageSettingsSchema.partial().optional(),
    transcriptionSettings: TranscriptionSettingsSchema.partial().optional(),
}).strict();

export type EnsureProfileBody = z.infer<typeof EnsureProfileBodySchema>;
export type UpdateProfileBody = z.infer<typeof UpdateProfileBodySchema>;

// --- Direct upload (mobile) ---

// Mirrors DIRECT_UPLOAD_MAX_BYTES (5 GiB) in src/lib/direct-upload-service.ts
const DIRECT_UPLOAD_MAX_BYTES = 5 * 1024 * 1024 * 1024;

export const InitDirectUploadBodySchema = z.object({
    fileName: z.string().trim().min(1).max(255),
    fileSize: z.number().int().positive().max(DIRECT_UPLOAD_MAX_BYTES),
    mimeType: z.string().trim().max(127).optional(),
});

export const CompleteDirectUploadBodySchema = z.object({
    uploadToken: z.string().trim().min(1).max(4096),
});

// --- Push notifications ---

export const PushSubscribeBodySchema = z.object({
    endpoint: z.string().url().max(1024),
    expirationTime: z.number().int().nullable().optional(),
    keys: z.object({
        p256dh: z.string().min(1).max(256),
        auth: z.string().min(1).max(256),
    }),
});

// --- Contacts pagination ---

const positiveOrZero = z.coerce.number().int().min(0);
const limitInRange = z.coerce.number().int().min(1).max(100).default(20);

export const ContactsListQuerySchema = z.object({
    limit: limitInRange.optional().default(20),
    skip: positiveOrZero.optional().default(0),
    search: z.string().trim().max(200).optional(),
});

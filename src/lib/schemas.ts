import { z } from 'zod';

export const GetRecordingsOptionsSchema = z.object({
    limit: z.number().min(1).max(100).optional().default(100),
    page: z.number().min(1).optional().default(1),
    skip: z.number().min(0).optional(),
    includeArchived: z.boolean().optional(),
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

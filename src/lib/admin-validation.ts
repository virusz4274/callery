import { z } from 'zod';

export type AdminFieldErrors = Record<string, string>;
export type AdminValidationFailure = { success: false; fieldErrors: AdminFieldErrors };
const nonnegative = z.number({ error: 'Enter a finite number of zero or more.' }).finite('Enter a finite number.').nonnegative('Enter a number of zero or more.');
export const AdminLimitsSchema = z.object({ storageAllocation: nonnegative, transcriptionAllocation: nonnegative });
export const AdminUsageSchema = z.object({ storageUsed: nonnegative, transcriptionUsed: nonnegative });
export const AdminPlanSchema = z.object({
    key: z.string().trim().min(1, 'Enter a plan key.'),
    name: z.string().trim().min(1, 'Enter a plan name.'),
    price: nonnegative,
    limits: z.object({ storage: nonnegative, transcription: nonnegative }),
});
export const AdminAnnouncementSchema = z.object({
    title: z.string().trim().min(1, 'Enter a title.'),
    message: z.string().trim().min(1, 'Enter a message.'),
    startDate: z.date(),
    endDate: z.date().nullish(),
}).refine(value => !value.endDate || value.endDate > value.startDate, {
    path: ['endDate'], message: 'Choose an end date after the start date.',
});

export function validationFailure(error: z.ZodError): AdminValidationFailure {
    const fieldErrors: AdminFieldErrors = {};
    for (const issue of error.issues) fieldErrors[issue.path.join('.')] ??= issue.message;
    return { success: false, fieldErrors };
}

export function numericInput(value: string): number {
    return value.trim() ? Number(value) : Number.NaN;
}

export function quotaPercent(used: number, allocated: number): number {
    return allocated > 0 ? Math.min(100, Math.max(0, used / allocated * 100)) : used > 0 ? 100 : 0;
}

export function announcementState(active: boolean, start: string, end?: string | null, now = Date.now()) {
    if (!active) return 'Inactive';
    if (new Date(start).getTime() > now) return 'Scheduled';
    if (end && new Date(end).getTime() <= now) return 'Expired';
    return 'Visible';
}

export function auditCalendarDate(iso?: string): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

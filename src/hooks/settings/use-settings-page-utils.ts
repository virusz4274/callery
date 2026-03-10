import { z } from 'zod';

export const passwordFormSchema = z
    .object({
        currentPassword: z.string().min(1, 'Current password is required for security.'),
        newPassword: z.string().min(6, 'Password must be at least 6 characters long.'),
        confirmPassword: z.string(),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: "New passwords don't match",
        path: ['confirmPassword'],
    });

export type SettingsTab = {
    id: string;
    label: string;
    icon: string;
};

export function buildSettingsPath(params: URLSearchParams): string {
    const query = params.toString();
    return query ? `/settings?${query}` : '/settings';
}

export function buildSettingsTabs(showBilling: boolean): SettingsTab[] {
    return [
        { id: 'overview', label: 'Overview', icon: '📊' },
        { id: 'profile', label: 'Profile', icon: '👤' },
        { id: 'general', label: 'General', icon: '⚙️' },
        { id: 'data', label: 'Data', icon: '💾' },
        { id: 'notifications', label: 'Notifications', icon: '🔔' },
        ...(showBilling ? [{ id: 'billing', label: 'Billing', icon: '💳' }] : []),
    ];
}

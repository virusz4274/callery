import type { LucideIcon } from 'lucide-react';
import { BellRing, CloudDownload, ContactRound, CreditCard, Database, Settings2, Sparkles, UserRound } from 'lucide-react';
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
    description: string;
    icon: LucideIcon;
};

export function buildSettingsPath(params: URLSearchParams): string {
    const query = params.toString();
    return query ? `/settings?${query}` : '/settings';
}

export function buildSettingsTabs(showBilling: boolean): SettingsTab[] {
    return [
        {
            id: 'profile',
            label: 'Profile',
            description: 'Name, email, and password.',
            icon: UserRound,
        },
        {
            id: 'general',
            label: 'General',
            description: 'Timezone.',
            icon: Settings2,
        },
        {
            id: 'sources',
            label: 'Sources',
            description: 'Google Contacts sync.',
            icon: ContactRound,
        },
        {
            id: 'processing',
            label: 'Processing',
            description: 'Automatic transcription and provider.',
            icon: Sparkles,
        },
        {
            id: 'retention',
            label: 'Retention',
            description: 'Usage and automatic deletion.',
            icon: Database,
        },
        {
            id: 'export',
            label: 'Export',
            description: 'Download your library.',
            icon: CloudDownload,
        },
        {
            id: 'notifications',
            label: 'Notifications',
            description: 'Browser alerts and email preferences.',
            icon: BellRing,
        },
        ...(showBilling
            ? [
                  {
                      id: 'billing',
                      label: 'Billing',
                      description: 'Plan, invoices, and usage.',
                      icon: CreditCard,
                  },
              ]
            : []),
    ];
}

import type { LucideIcon } from 'lucide-react';
import { BellRing, CreditCard, Database, LayoutDashboard, Settings2, UserRound } from 'lucide-react';
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
            id: 'overview',
            label: 'Overview',
            description: 'Check account health, recording activity, and quick next steps.',
            icon: LayoutDashboard,
        },
        {
            id: 'profile',
            label: 'Profile',
            description: 'Manage identity details, login credentials, and personal account info.',
            icon: UserRound,
        },
        {
            id: 'general',
            label: 'General',
            description: 'Set workspace defaults like timezone and other everyday preferences.',
            icon: Settings2,
        },
        {
            id: 'data',
            label: 'Data',
            description: 'Control exports, syncs, storage, and transcription-related settings.',
            icon: Database,
        },
        {
            id: 'notifications',
            label: 'Notifications',
            description: 'Choose which system updates and digests the workspace should send.',
            icon: BellRing,
        },
        ...(showBilling
            ? [
                  {
                      id: 'billing',
                      label: 'Billing',
                      description: 'Review your plan, invoices, usage, and upgrade options.',
                      icon: CreditCard,
                  },
              ]
            : []),
    ];
}

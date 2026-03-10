import type { UserResponse } from '@/lib/db/types';

export type Invoice = {
    id: string;
    date: string;
    amount: number;
    status: 'Paid' | 'Pending' | 'Failed';
    url?: string | null;
};

export type BillingSettingsProps = {
    userProfile: UserResponse | null;
};

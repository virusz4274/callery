import type { UserResponse } from '@/lib/db/types';

export type Invoice = {
    id: string;
    date: string;
    amount: string;
    status: string;
};

export type BillingSettingsProps = {
    invoices: Invoice[];
    isLoading: boolean;
    userProfile: UserResponse | null;
};

export type BillingInterval = 'monthly' | 'yearly' | 'lifetime';

export type PlanFormValues = {
    key: string;
    name: string;
    description: string;
    stripePriceId: string;
    stripeStoragePriceId: string;
    stripeTranscriptionPriceId: string;
    price: string;
    interval: BillingInterval;
    storageGB: string;
    transcriptionMinutes: string;
    featuresInput: string;
    isDefault: boolean;
    isActive: boolean;
};

export const INTERVALS: Array<{ value: BillingInterval; label: string }> = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' },
    { value: 'lifetime', label: 'Lifetime' },
];

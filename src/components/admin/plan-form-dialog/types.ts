export type BillingInterval = 'monthly' | 'yearly' | 'lifetime' | 'trial';

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
    { value: 'trial', label: 'One-time 30-day trial' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' },
    { value: 'lifetime', label: 'Lifetime' },
];

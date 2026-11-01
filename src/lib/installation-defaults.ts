import type { Plan } from './db/types/plan';
import { PLAN_KEYS } from './plans';

export const ONE_TIME_TRIAL = Object.freeze({ durationDays: 30, weightedSeconds: 10 * 60, storageBytes: 100 * 1024 ** 2 });

/** Installation templates only. Published Stripe snapshots determine sale prices. */
export const INSTALLATION_PLANS: ReadonlyArray<Omit<Plan, '_id' | 'createdAt' | 'updatedAt'>> = [
    { key: PLAN_KEYS.FREE_TRIAL, name: 'Free Trial', description: 'One-time 30-day trial without a credit card', price: 0, currency: 'USD', interval: 'trial',
        limits: { storage: ONE_TIME_TRIAL.storageBytes, transcription: ONE_TIME_TRIAL.weightedSeconds }, features: ['Standard Storage', 'Community Support', 'One-time 30-Day Trial'],
        isDefault: true, isActive: true, stripePriceId: '' },
    { key: PLAN_KEYS.STANDARD, name: 'Standard', description: 'For regular usage', price: 10, currency: 'USD', interval: 'monthly',
        limits: { storage: 2 * 1024 ** 3, transcription: 60 * 60 }, features: ['Standard Storage', 'Email Support'],
        isDefault: false, isActive: true, stripePriceId: '', stripeStoragePriceId: '', stripeTranscriptionPriceId: '' },
    { key: PLAN_KEYS.PRO, name: 'Pro', description: 'Power user access', price: 20, currency: 'USD', interval: 'monthly',
        limits: { storage: 5 * 1024 ** 3, transcription: 120 * 60 }, features: ['5 GiB Storage', 'Advanced AI Transcription', 'Priority Email Support', 'Data Export', 'Detailed Analytics'],
        isDefault: false, isActive: true, stripePriceId: '', stripeStoragePriceId: '', stripeTranscriptionPriceId: '' },
    { key: PLAN_KEYS.LIFETIME, name: 'Lifetime', description: 'One-time payment for platform access', price: 250, currency: 'USD', interval: 'lifetime',
        limits: { storage: 0, transcription: 0 }, features: ['Lifetime Access', 'Pay-as-you-go Storage', 'Pay-as-you-go Transcription'],
        isDefault: false, isActive: true, stripePriceId: '', stripeStoragePriceId: '', stripeTranscriptionPriceId: '' },
    { key: PLAN_KEYS.INTERNAL, name: 'Internal', description: 'Team & Family unrestricted access', price: 0, currency: 'USD', interval: 'lifetime',
        limits: { storage: 1024 ** 4, transcription: 0 }, features: ['Unlimited Transcription', 'Internal Use'],
        isDefault: false, isActive: true, stripePriceId: '' },
    { key: PLAN_KEYS.CUSTOM, name: 'Custom', description: 'Enterprise needs', price: 0, currency: 'USD', interval: 'yearly',
        limits: { storage: 0, transcription: 0 }, features: ['Talk to Sales', 'Custom SLA'], isDefault: false, isActive: true, stripePriceId: '' },
];

/** Editable import example, never inserted into financial collections by initialization. */
export function installationCatalogImportTemplate() {
    return { plans: INSTALLATION_PLANS.filter(plan => [PLAN_KEYS.STANDARD, PLAN_KEYS.PRO, PLAN_KEYS.LIFETIME].some(key => key === plan.key))
        .map(plan => ({ key: plan.key, stripePriceId: `price_${plan.key}`, limits: { ...plan.limits } })),
    usagePriceIds: { recurring: { storage: 'price_storage', transcription: 'price_audio' },
        lifetime: { storage: 'price_lifetime_storage', transcription: 'price_lifetime_audio' } } };
}

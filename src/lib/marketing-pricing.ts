import type { PublicPlan } from '@/app/actions/plans';
import type { Plan } from '@/lib/db/types/plan';

export type MarketingPlanKey = 'standard' | 'pro' | 'lifetime';

export type MarketingUsagePricing = {
    providers: { id: string; name: string; multiplier: number; usdPerMinute: string }[];
    storageUsdPerGiB: string;
    minimumRecordingUsd: string;
};

export type MarketingTrial = {
    key: 'free-trial';
    name: 'Free trial';
    description: string;
    price: 0;
    currency: 'USD';
    durationDays: 30;
    storageBytes: number;
    weightedMinutes: number;
};

export type MarketingPlan = {
    key: MarketingPlanKey;
    name: string;
    description: string;
    price: number;
    currency: string;
    interval: PublicPlan['interval'];
    storageBytes: number | null;
    weightedMinutes: number | null;
    usage: MarketingUsagePricing | null;
    checkout: { stripePriceId: string; catalogVersion: string } | null;
};

export type MarketingPricing = {
    trial: MarketingTrial | null;
    plans: MarketingPlan[];
};

type TrialSource = Pick<Plan, 'key' | 'isActive' | 'limits'>;

const publicPlans = {
    standard: { name: 'Standard', description: 'Keep your everyday calls organized and easy to find.' },
    pro: { name: 'Pro', description: 'More room and transcription for a growing recording collection.' },
    lifetime: { name: 'Lifetime', description: 'Pay once for access, then pay for storage and transcription as you use them.' },
} as const;

const providerNames: Record<string, string> = {
    soniox: 'Soniox',
    gemini: 'Gemini',
    elevenlabs: 'ElevenLabs',
};

function allowance(value: number | undefined): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function decimalAmount(value: string | undefined): value is string {
    return typeof value === 'string' && /^(0|[1-9]\d*)(\.\d+)?$/.test(value)
        && Number.isFinite(Number(value)) && value.length <= 48;
}

function usagePricing(plan: PublicPlan): MarketingUsagePricing | null {
    const pricing = plan.usagePricing;
    if (!pricing?.ready || pricing.currency !== 'usd'
        || pricing.tier !== (plan.interval === 'lifetime' ? 'lifetime' : 'recurring')
        || !decimalAmount(pricing.storageUsdPerGiB) || !decimalAmount(pricing.minimumRecordingUsd)) return null;

    const providers = pricing.providers.filter(provider => Object.hasOwn(providerNames, provider.id)
        && Number.isFinite(provider.multiplier) && provider.multiplier > 0 && decimalAmount(provider.usdPerMinute))
        .map(provider => ({ id: provider.id, name: providerNames[provider.id], multiplier: provider.multiplier, usdPerMinute: provider.usdPerMinute }));
    if (!providers.length) return null;
    return { providers, storageUsdPerGiB: pricing.storageUsdPerGiB, minimumRecordingUsd: pricing.minimumRecordingUsd };
}

/** Customer copy is curated here; imported product names and feature strings stay out of marketing. */
export function projectMarketingPricing(paidPlans: PublicPlan[], trialPlan: TrialSource | null): MarketingPricing {
    const storageBytes = allowance(trialPlan?.limits.storage);
    const weightedMinutes = allowance(trialPlan ? trialPlan.limits.transcription / 60 : undefined);
    const trial: MarketingTrial | null = trialPlan?.key === 'free-trial' && trialPlan.isActive
        && storageBytes !== null && weightedMinutes !== null ? {
            key: 'free-trial', name: 'Free trial', description: 'Try your own recordings for 30 days before choosing a paid plan.',
            price: 0, currency: 'USD', durationDays: 30, storageBytes, weightedMinutes,
        } : null;

    const plans = (Object.keys(publicPlans) as MarketingPlanKey[]).flatMap(key => {
        const plan = paidPlans.find(candidate => candidate.key === key
            && Number.isFinite(candidate.price) && candidate.price > 0
            && typeof candidate.currency === 'string' && /^[a-z]{3}$/i.test(candidate.currency)
            && (key === 'lifetime' ? candidate.interval === 'lifetime' : ['monthly', 'yearly'].includes(candidate.interval)));
        if (!plan) return [];
        const checkout = plan.isPurchasable === true && plan.stripePriceId?.startsWith('price_') && plan.catalogVersion
            ? { stripePriceId: plan.stripePriceId, catalogVersion: plan.catalogVersion } : null;
        return [{ key, ...publicPlans[key], price: plan.price, currency: plan.currency.toUpperCase(), interval: plan.interval,
            storageBytes: allowance(plan.storageBytes), weightedMinutes: allowance(plan.weightedMinutes),
            usage: usagePricing(plan), checkout }];
    });
    return { trial, plans };
}

export function formatMarketingPrice(value: number, currency: string): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency,
        maximumFractionDigits: Number.isInteger(value) ? 0 : 2 }).format(value);
}

export function formatMarketingStorage(bytes: number): string {
    if (bytes === 0) return '0 MiB';
    const gib = bytes / 1024 ** 3;
    if (gib >= 1) return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(gib)} GiB`;
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(bytes / 1024 ** 2)} MiB`;
}

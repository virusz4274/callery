export const PLAN_KEYS = {
    FREE_TRIAL: 'free-trial',
    STANDARD: 'standard',
    PRO: 'pro',
    LIFETIME: 'lifetime',
    INTERNAL: 'internal',
    CUSTOM: 'custom',
} as const;

export const DEFAULT_PLAN_KEY = PLAN_KEYS.FREE_TRIAL;

const BUILTIN_PLAN_DISPLAY_NAMES: Record<string, string> = {
    [PLAN_KEYS.FREE_TRIAL]: 'Free Trial',
    [PLAN_KEYS.STANDARD]: 'Standard',
    [PLAN_KEYS.PRO]: 'Pro',
    [PLAN_KEYS.LIFETIME]: 'Lifetime',
    [PLAN_KEYS.INTERNAL]: 'Internal',
    [PLAN_KEYS.CUSTOM]: 'Custom',
};

export function getPlanDisplayName(planKey: string): string {
    return BUILTIN_PLAN_DISPLAY_NAMES[planKey] ?? planKey;
}

export function isFreeTrialPlanKey(planKey: string): boolean {
    return planKey === PLAN_KEYS.FREE_TRIAL;
}

export function isLifetimePlanKey(planKey: string): boolean {
    return planKey === PLAN_KEYS.LIFETIME;
}

export function isInternalPlanKey(planKey: string): boolean {
    return planKey === PLAN_KEYS.INTERNAL;
}

export function isDefaultFreeAccessPlanKey(planKey: string): boolean {
    return isFreeTrialPlanKey(planKey);
}

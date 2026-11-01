import type { Plan } from './types/plan';
import { billingEnabled } from '@/lib/config';
import { PLAN_KEYS } from '@/lib/plans';

/** Onboarding grants a trial, never a paid purchase or Lifetime ownership. */
export function assertValidDefaultPlan(plan: Plan | null, managed = billingEnabled()): Plan {
    if (!plan) throw new Error('Default plan document is missing. Run `pnpm db:init --dry-run` and select an existing onboarding plan.');
    if (!plan.isActive) throw new Error('The onboarding default plan must be active.');
    if (managed && plan.key !== PLAN_KEYS.FREE_TRIAL) throw new Error('Managed signups require the active Free Trial onboarding plan.');
    return plan;
}

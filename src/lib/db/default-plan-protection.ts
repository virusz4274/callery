import type { Db } from 'mongodb';
import { billingEnabled } from '@/lib/config';
import { Collections } from '@/lib/mongodb';
import type { Plan } from './types/plan';
import { assertValidDefaultPlan } from './default-plan';
import { readSystemSettingsSingleton } from './system-settings-singleton';

/** The settings reference is authoritative; the plan's display flag can differ. */
export async function assertPlanUpdatePreservesOnboarding(db: Db, next: Plan, managed = billingEnabled()): Promise<void> {
    const settings = await readSystemSettingsSingleton(db, Collections.SYSTEM_SETTINGS);
    if (settings?.defaultPlanId.equals(next._id)) assertValidDefaultPlan(next, managed);
}

export async function assertPlanDeletionPreservesOnboarding(db: Db, plan: Plan | null): Promise<void> {
    const settings = await readSystemSettingsSingleton(db, Collections.SYSTEM_SETTINGS);
    if (plan && (plan.isDefault || settings?.defaultPlanId.equals(plan._id))) {
        throw new Error('The default signup plan cannot be deleted. Choose another active onboarding default first.');
    }
}

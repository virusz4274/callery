import { MongoServerError, type Db } from 'mongodb';
import type { Plan, SystemSettings } from '@/lib/db/types';
import { PLAN_KEYS } from '@/lib/plans';
import { INSTALLATION_PLANS } from '@/lib/installation-defaults';
import { logger } from '@/lib/logger';
import { billingEnabled } from '@/lib/config';
import { assertValidDefaultPlan } from '../default-plan';
import { INITIAL_SYSTEM_SETTINGS_ID, readSystemSettingsSingleton } from '../system-settings-singleton';

export type SeedCollections = { PLANS: string; SYSTEM_SETTINGS: string };
function duplicateKey(error: unknown) {
    return error instanceof MongoServerError && error.code === 11000
        || typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

/** Only missing templates are inserted. Configuration and financial history
 * are never refreshed from installation defaults. */
export async function seedPlans(db: Db, collections: SeedCollections): Promise<{ created: string[]; preserved: string[] }> {
    const result = { created: [] as string[], preserved: [] as string[] };
    const plans = db.collection<Plan>(collections.PLANS), now = new Date();
    for (const definition of INSTALLATION_PLANS) {
        try {
            const written = await plans.updateOne({ key: definition.key }, {
                $setOnInsert: { ...structuredClone(definition), createdAt: now, updatedAt: now },
            }, { upsert: true });
            (written.upsertedCount ? result.created : result.preserved).push(definition.key);
        } catch (error) {
            // A competing initializer may have inserted this exact key. A name
            // collision with another plan, or any other error, must stay visible.
            if (!duplicateKey(error) || !await plans.findOne({ key: definition.key })) throw error;
            result.preserved.push(definition.key);
        }
    }
    logger.info(`Plan templates: ${result.created.length} created, ${result.preserved.length} preserved.`);
    return result;
}

async function validateSettings(db: Db, collections: SeedCollections, settings: SystemSettings, managed: boolean) {
    const plan = settings.defaultPlanId && await db.collection<Plan>(collections.PLANS).findOne({ _id: settings.defaultPlanId });
    assertValidDefaultPlan(plan || null, managed);
}

export async function seedSystemSettings(db: Db, collections: SeedCollections, managed = billingEnabled()): Promise<'created' | 'preserved'> {
    const existing = await readSystemSettingsSingleton(db, collections.SYSTEM_SETTINGS);
    if (existing) {
        await validateSettings(db, collections, existing, managed);
        logger.info('System settings preserved.');
        return 'preserved';
    }
    const defaultPlan = await db.collection<Plan>(collections.PLANS).findOne({ key: PLAN_KEYS.FREE_TRIAL });
    if (!defaultPlan) throw new Error('Seed plans before initializing system settings.');
    assertValidDefaultPlan(defaultPlan, managed);
    let created = false;
    try {
        const result = await db.collection<SystemSettings>(collections.SYSTEM_SETTINGS).updateOne({ _id: INITIAL_SYSTEM_SETTINGS_ID }, {
            $setOnInsert: { allowSignups: true, maintenanceMode: false, defaultPlanId: defaultPlan._id, updatedAt: new Date() },
        }, { upsert: true });
        created = Boolean(result.upsertedCount);
    } catch (error) {
        if (!duplicateKey(error)) throw error;
    }
    const saved = await readSystemSettingsSingleton(db, collections.SYSTEM_SETTINGS);
    if (!saved) throw new Error('System settings creation could not be verified. Retry initialization.');
    await validateSettings(db, collections, saved, managed);
    logger.info(`System settings ${created ? 'created' : 'preserved'}. Self-host provider defaults apply unless explicitly overridden.`);
    return created ? 'created' : 'preserved';
}

import { Collections, getMongoDb } from '@/lib/mongodb';
import type { SystemSettings, UpdateSystemSettingsInput } from './types';
import { readSystemSettingsSingleton } from './system-settings-singleton';
import { assertValidDefaultPlan } from './default-plan';

/** Admin edits require a previously initialized singleton. */
export async function updateSystemSettingsDocument(data: UpdateSystemSettingsInput): Promise<void> {
    const db = await getMongoDb();
    const settings = await readSystemSettingsSingleton(db, Collections.SYSTEM_SETTINGS);
    if (!settings) throw new Error('System settings are missing. Run `pnpm db:init` first.');
    if (data.defaultPlanId !== undefined) {
        const plan = await db.collection<import('./types').Plan>(Collections.PLANS).findOne({ _id: data.defaultPlanId });
        assertValidDefaultPlan(plan);
    }

    const { transcriptionMultipliers, ...values } = data;
    const fields: Record<string, unknown> = Object.fromEntries(
        Object.entries(values).filter(([, value]) => value !== undefined)
    );
    if (transcriptionMultipliers) {
        for (const [provider, value] of Object.entries(transcriptionMultipliers)) {
            if (value !== undefined) fields[`transcriptionMultipliers.${provider}`] = value;
        }
    }

    const result = await db.collection<SystemSettings>(Collections.SYSTEM_SETTINGS).updateOne(
        { _id: settings._id }, { $set: { ...fields, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) throw new Error('System settings no longer exist. Run `pnpm db:init` first.');
}

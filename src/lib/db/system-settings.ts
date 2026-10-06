import { Collections, getMongoDb } from '@/lib/mongodb';
import type { SystemSettings, UpdateSystemSettingsInput } from './types';

/** Admin edits require a previously initialized singleton. */
export async function updateSystemSettingsDocument(data: UpdateSystemSettingsInput): Promise<void> {
    const db = await getMongoDb();
    const settings = await db.collection<SystemSettings>(Collections.SYSTEM_SETTINGS).findOne({});
    if (!settings) throw new Error('System settings are missing. Run `pnpm db:init` first.');

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

'use server';

import { logAdminAction } from '@/app/actions/audit-log';
import { SystemSettings, SystemSettingsResponse, UpdateSystemSettingsInput } from '@/lib/db/types';
import { parseObjectId, requireCurrentAdmin } from '@/lib/admin-auth';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';
import { connection } from 'next/server';

function mapSettings(settings: SystemSettings): SystemSettingsResponse {
    return {
        id: settings._id.toString(),
        allowSignups: settings.allowSignups,
        maintenanceMode: settings.maintenanceMode,
        defaultPlanId: settings.defaultPlanId?.toString(),
        transcriptionMultipliers: settings.transcriptionMultipliers,
        updatedAt: settings.updatedAt.toISOString(),
    };
}

type UpdateSystemSettingsPayload =
    Omit<UpdateSystemSettingsInput, 'defaultPlanId'> & { defaultPlanId?: string | ObjectId };

/**
 * Get the singleton system settings.
 * Creates default settings if none exist.
 */
export async function getSystemSettings() {
    await connection();

    const db = await getMongoDb();
    let settings = await db.collection<SystemSettings>(Collections.SYSTEM_SETTINGS).findOne({});

    if (!settings) {
        const defaultSettings: SystemSettings = {
            _id: new ObjectId(),
            allowSignups: true,
            maintenanceMode: false,
            updatedAt: new Date(),
        };

        await db.collection(Collections.SYSTEM_SETTINGS).insertOne(defaultSettings);
        settings = defaultSettings;
    }

    return mapSettings(settings);
}

export async function updateSystemSettings(data: UpdateSystemSettingsPayload) {
    const admin = await requireCurrentAdmin();

    const db = await getMongoDb();
    const updateData: Record<string, unknown> = {
        ...data,
        updatedAt: new Date(),
    };

    if (data.defaultPlanId && typeof data.defaultPlanId === 'string') {
        updateData.defaultPlanId = parseObjectId(data.defaultPlanId, 'defaultPlanId');
    }

    await db.collection(Collections.SYSTEM_SETTINGS).updateOne({}, { $set: updateData }, { upsert: true });

    await logAdminAction(admin._id.toString(), 'SETTINGS_UPDATE', { updates: data }, 'system', 'SYSTEM');

    revalidatePath('/admin/settings');
}

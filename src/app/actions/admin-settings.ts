'use server';

import { logAdminAction } from '@/app/actions/audit-log';
import { SystemSettings, SystemSettingsResponse, UpdateSystemSettingsInput } from '@/lib/db/types';
import { parseObjectId, requireCurrentAdmin } from '@/lib/admin-auth';
import { getRequiredSystemSettings } from '@/lib/db/users';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { revalidatePath } from 'next/cache';

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
    Omit<UpdateSystemSettingsInput, 'defaultPlanId'> & { defaultPlanId?: string };

/**
 * Get the singleton system settings.
 * Throws when required seed data is missing.
 */
export async function getSystemSettings() {
    await requireCurrentAdmin();
    const settings = await getRequiredSystemSettings();
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

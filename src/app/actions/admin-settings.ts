'use server';

import { getMongoDb, Collections } from '@/lib/mongodb';
import { SystemSettings, UpdateSystemSettingsInput, SystemSettingsResponse } from '@/lib/db/types';
import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';

function mapSettings(settings: SystemSettings): SystemSettingsResponse {
    return {
        id: settings._id.toString(),
        allowSignups: settings.allowSignups,
        maintenanceMode: settings.maintenanceMode,
        defaultPlanId: settings.defaultPlanId?.toString(),
        updatedAt: settings.updatedAt.toISOString(),
    };
}

import { connection } from 'next/server';

/**
 * Get the singleton system settings.
 * Creates default settings if none exist.
 */
export async function getSystemSettings() {
    console.log('[getSystemSettings] Starting...');
    await connection();
    console.log('[getSystemSettings] Next.js connection() pass');
    const db = await getMongoDb();
    console.log('[getSystemSettings] Got DB instance, finding settings...');
    let settings = await db.collection<SystemSettings>(Collections.SYSTEM_SETTINGS).findOne({});
    console.log('[getSystemSettings] findOne result:', settings ? 'Found' : 'Not Found');

    if (!settings) {
        console.log('[getSystemSettings] Creating default settings...');
        // Initialize default settings
        const defaultSettings: SystemSettings = {
            _id: new ObjectId(),
            allowSignups: true,
            maintenanceMode: false,
            updatedAt: new Date(),
        };
        await db.collection(Collections.SYSTEM_SETTINGS).insertOne(defaultSettings);
        settings = defaultSettings;
        console.log('[getSystemSettings] Default settings created.');
    }

    console.log('[getSystemSettings] Returning settings.');
    return mapSettings(settings);
}

import { getCurrentAdmin } from '@/lib/admin-auth';
import { logAdminAction } from '@/app/actions/audit-log';

export async function updateSystemSettings(data: UpdateSystemSettingsInput) {
    const admin = await getCurrentAdmin();
    if (!admin) throw new Error('Unauthorized');

    const db = await getMongoDb();

    // Prepare update data, converting string ID to ObjectId if present
    const updateData: Partial<SystemSettings> = {
        ...data,
        updatedAt: new Date(),
    };

    if (data.defaultPlanId && typeof data.defaultPlanId === 'string') {
        updateData.defaultPlanId = new ObjectId(data.defaultPlanId);
    }

    // We use updateOne with upsert to be safe, though getSystemSettings ensures it exists
    await db.collection(Collections.SYSTEM_SETTINGS).updateOne(
        {},
        { $set: updateData },
        { upsert: true }
    );

    await logAdminAction(
        admin._id.toString(),
        'SETTINGS_UPDATE',
        { updates: data },
        'system',
        'SYSTEM'
    );

    revalidatePath('/admin/settings');
}

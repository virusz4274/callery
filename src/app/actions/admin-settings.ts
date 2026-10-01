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
    await connection();
    const db = await getMongoDb();
    let settings = await db.collection<SystemSettings>(Collections.SYSTEM_SETTINGS).findOne({});

    if (!settings) {
        // Initialize default settings
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

import { getCurrentAdmin } from '@/lib/admin-auth';
import { logAdminAction } from '@/app/actions/audit-log';

export async function updateSystemSettings(data: UpdateSystemSettingsInput) {
    const admin = await getCurrentAdmin();
    if (!admin) throw new Error('Unauthorized');

    const db = await getMongoDb();

    for (const key of ['allowSignups', 'maintenanceMode'] as const) {
        if (key in data && typeof data[key] !== 'boolean') {
            throw new Error(`Invalid ${key}: must be a boolean`);
        }
    }

    // Prepare update data, converting string ID to ObjectId if present
    const { defaultPlanId, ...rest } = data;
    const updateData: Partial<SystemSettings> = {
        ...rest,
        updatedAt: new Date(),
    };

    if (defaultPlanId) {
        if (!ObjectId.isValid(defaultPlanId)) {
            throw new Error('Invalid defaultPlanId');
        }
        const planExists = await db.collection(Collections.PLANS).countDocuments(
            { _id: new ObjectId(defaultPlanId) },
            { limit: 1 }
        );
        if (!planExists) {
            throw new Error('Default plan not found');
        }
        updateData.defaultPlanId = new ObjectId(defaultPlanId);
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

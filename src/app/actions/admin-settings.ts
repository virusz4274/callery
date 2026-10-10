'use server';

import { validationFailure } from '@/lib/admin-validation';
import { logAdminAction } from '@/app/actions/audit-log';
import { SystemSettings, SystemSettingsResponse, UpdateSystemSettingsInput } from '@/lib/db/types';
import { parseObjectId, requireCurrentAdmin } from '@/lib/admin-auth';
import { getRequiredSystemSettings } from '@/lib/db/users';
import { updateSystemSettingsDocument } from '@/lib/db/system-settings';
import { revalidatePath } from 'next/cache';
import { transcriptionPricing } from '@/lib/config';
import { resolveTranscriptionMultipliers, TranscriptionMultipliersSchema, type TranscriptionMultipliers } from '@/lib/transcription-multipliers';
import { z } from 'zod';

function mapSettings(settings: SystemSettings): SystemSettingsResponse & { transcriptionMultipliers: TranscriptionMultipliers } {
    return {
        id: settings._id.toString(),
        allowSignups: settings.allowSignups,
        maintenanceMode: settings.maintenanceMode,
        defaultPlanId: settings.defaultPlanId.toString(),
        transcriptionMultipliers: resolveTranscriptionMultipliers(transcriptionPricing(), settings.transcriptionMultipliers),
        updatedAt: settings.updatedAt.toISOString(),
        team: settings.team,
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
    const parsed = z.object({
        allowSignups: z.boolean().optional(), maintenanceMode: z.boolean().optional(),
        defaultPlanId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
        transcriptionMultipliers: TranscriptionMultipliersSchema.partial().optional(),
    }).strict().safeParse(data);
    if (!parsed.success) return validationFailure(parsed.error);
    if (data.allowSignups && (await getRequiredSystemSettings()).team?.enabled) throw new Error('Company registration is invitation-only.');

    const { defaultPlanId, ...settings } = data;
    if (settings.transcriptionMultipliers !== undefined) {
        const validation = TranscriptionMultipliersSchema.partial().safeParse(settings.transcriptionMultipliers);
        if (!validation.success) return validationFailure(validation.error);
    }
    if (defaultPlanId !== undefined && !/^[a-f0-9]{24}$/i.test(defaultPlanId)) return { success: false as const, fieldErrors: { defaultPlanId: 'Choose a valid default plan.' } };
    await updateSystemSettingsDocument({
        ...settings,
        ...(defaultPlanId !== undefined ? { defaultPlanId: parseObjectId(defaultPlanId, 'defaultPlanId') } : {}),
    });

    await logAdminAction(admin._id.toString(), 'SETTINGS_UPDATE', { updates: data }, 'system', 'SYSTEM');

    revalidatePath('/admin/settings');
}

'use server';

import { logAdminAction } from '@/app/actions/audit-log';
import { Plan } from '@/lib/db/types';
import { requireCurrentAdmin, parseObjectId } from '@/lib/admin-auth';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { revalidatePath } from 'next/cache';

export async function updateContactPlan(
    userId: string,
    planKey: string
): Promise<{ success: boolean; message?: string }> {
    const admin = await requireCurrentAdmin();

    const db = await getMongoDb();
    const userObjectId = parseObjectId(userId, 'userId');

    const plan = await db.collection<Plan>(Collections.PLANS).findOne({ key: planKey });

    if (!plan) {
        console.error(`Plan ${planKey} not found`);
        return { success: false, message: 'Plan not found' };
    }

    const oldUser = await db.collection(Collections.USERS).findOne({ _id: userObjectId });

    try {
        await db.collection(Collections.USERS).updateOne(
            { _id: userObjectId },
            {
                $set: {
                    planKey: plan.key,
                    storageAllocation: plan.limits.storage,
                    transcriptionAllocation: plan.limits.transcription,
                    updatedAt: new Date(),
                },
            }
        );

        await logAdminAction(
            admin._id.toString(),
            'USER_LIMITS_UPDATE',
            {
                action: 'PLAN_ASSIGNMENT',
                oldPlanKey: oldUser?.planKey,
                newPlanKey: plan.key,
                newLimits: {
                    storageAllocation: plan.limits.storage,
                    transcriptionAllocation: plan.limits.transcription,
                },
            },
            userId,
            'USER'
        );

        revalidatePath('/admin/users');
        revalidatePath(`/admin/users/${userId}`);

        return { success: true };
    } catch (error) {
        console.error('Failed to update user plan', error);
        return { success: false, message: 'Database update failed' };
    }
}

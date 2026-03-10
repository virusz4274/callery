'use server';

import { logAdminAction } from '@/app/actions/audit-log';
import { Plan } from '@/lib/db/types';
import { getCurrentAdmin, parseObjectId } from '@/lib/admin-auth';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { revalidatePath } from 'next/cache';

export async function updateContactPlan(
    userId: string,
    planName: string
): Promise<{ success: boolean; message?: string }> {
    const admin = await getCurrentAdmin();
    if (!admin) {
        return { success: false, message: 'Unauthorized' };
    }

    const db = await getMongoDb();
    const userObjectId = parseObjectId(userId, 'userId');

    const plan = await db.collection<Plan>(Collections.PLANS).findOne({ name: planName });

    if (!plan && planName !== 'Custom') {
        console.error(`Plan ${planName} not found`);
        return { success: false, message: 'Plan not found' };
    }

    let storageAllocation = 5 * 1024 * 1024 * 1024;
    let transcriptionAllocation = 60 * 60;

    if (plan) {
        storageAllocation = plan.limits.storage;
        transcriptionAllocation = plan.limits.transcription;
    }

    const oldUser = await db.collection(Collections.USERS).findOne({ _id: userObjectId });

    try {
        await db.collection(Collections.USERS).updateOne(
            { _id: userObjectId },
            {
                $set: {
                    plan: planName,
                    storageAllocation,
                    transcriptionAllocation,
                    updatedAt: new Date(),
                },
            }
        );

        await logAdminAction(
            admin._id.toString(),
            'USER_LIMITS_UPDATE',
            {
                action: 'PLAN_ASSIGNMENT',
                oldPlan: oldUser?.plan,
                newPlan: planName,
                newLimits: { storageAllocation, transcriptionAllocation },
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

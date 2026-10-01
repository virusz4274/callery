
'use server';

import { getMongoDb, Collections } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { Plan } from '@/lib/db/types';
import { revalidatePath } from 'next/cache';

import { getCurrentAdmin } from '@/lib/admin-auth';
import { logAdminAction } from '@/app/actions/audit-log';

export async function updateContactPlan(userId: string, planName: string): Promise<{ success: boolean; message?: string }> {
    const admin = await getCurrentAdmin();
    if (!admin) {
        return { success: false, message: 'Unauthorized' };
    }

    const db = await getMongoDb();

    // 1. Get the plan details to find limits
    const plan = await db.collection<Plan>(Collections.PLANS).findOne({ name: planName });

    if (!plan && planName !== 'Custom') {
        // If plan not found and not "Custom", fetch "Free" or failsafe
        console.error(`Plan ${planName} not found`);
        return { success: false, message: 'Plan not found' };
    }

    // Default limits if plan lookup failed (shouldn't happen with valid UI)
    let storageAllocation = 5 * 1024 * 1024 * 1024;
    let transcriptionAllocation = 60 * 60;

    if (plan) {
        storageAllocation = plan.limits.storage;
        transcriptionAllocation = plan.limits.transcription;
    }

    try {
        if (!ObjectId.isValid(userId)) {
            return { success: false, message: 'Invalid user id' };
        }

        // Get old user data for logging
        const oldUser = await db.collection(Collections.USERS).findOne({ _id: new ObjectId(userId) });

        await db.collection(Collections.USERS).updateOne(
            { _id: new ObjectId(userId) },
            {
                $set: {
                    plan: planName,
                    storageAllocation,
                    transcriptionAllocation,
                    updatedAt: new Date()
                }
            }
        );

        await logAdminAction(
            admin._id.toString(),
            'USER_LIMITS_UPDATE', // Reusing LIMITS_UPDATE or creating USER_PLAN_CHANGE? LIMITS_UPDATE works as it touches limits.
            {
                action: 'PLAN_ASSIGNMENT',
                oldPlan: oldUser?.plan,
                newPlan: planName,
                newLimits: { storageAllocation, transcriptionAllocation }
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

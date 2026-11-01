'use server';

import { logger } from '@/lib/logger';

import { logAdminAction } from '@/app/actions/audit-log';
import type { Plan, User } from '@/lib/db/types';
import { requireCurrentAdmin, parseObjectId } from '@/lib/admin-auth';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { revalidatePath } from 'next/cache';
import { billingFence, BillingBusyError, withBillingLease } from '@/lib/stripe/billing-lock';

class PlanAssignmentError extends Error {}

export async function updateContactPlan(
    userId: string,
    planKey: string
): Promise<{ success: boolean; message?: string }> {
    const admin = await requireCurrentAdmin();

    const db = await getMongoDb();
    const userObjectId = parseObjectId(userId, 'userId');

    const plan = await db.collection<Plan>(Collections.PLANS).findOne({ key: planKey });

    if (!plan || !plan.isActive) {
        logger.error(`Plan ${planKey} not found`);
        return { success: false, message: 'Plan not found' };
    }

    const oldUser = await db.collection<User>(Collections.USERS).findOne({ _id: userObjectId });
    if (!oldUser) return { success: false, message: 'User not found' };

    try {
        await withBillingLease(db, oldUser.authSubject, async (current, owner) => {
            if (!current._id.equals(userObjectId) || current.disabled || current.softDelete?.isDeleted) throw new PlanAssignmentError('This account cannot receive a plan assignment.');
            if (current.billingRecovery?.purgingAt || current.billingRecovery?.purgedAt) throw new PlanAssignmentError('Archive cleanup has already started. Restore the account separately before assigning Internal access.');
            if (current.billingOperation && !['quoted', 'applied', 'canceled'].includes(current.billingOperation.state)) throw new PlanAssignmentError('Finish the pending plan change before assigning an administrator plan.');
            if (plan.key === 'free-trial' && (current.planKey !== 'free-trial' || current.billingEntitlement?.source !== 'trial'
                || !(current.trialEndsAt instanceof Date) || current.trialEndsAt <= new Date())) {
                throw new PlanAssignmentError('The one-time Free Trial cannot be restarted through administrator plan assignment.');
            }
            const updated = await db.collection<User>(Collections.USERS).updateOne(
                billingFence(current, owner),
                {
                    $set: {
                        planKey: plan.key,
                        storageAllocation: plan.limits.storage,
                        transcriptionAllocation: plan.limits.transcription,
                        billingEntitlement: plan.key === 'free-trial' ? current.billingEntitlement : { source: 'admin', reference: admin._id.toString(), grantedAt: new Date() },
                        'billingSettings.allowOverage': false,
                        updatedAt: new Date(),
                    },
                    // Customer debt, financial review and historical purchase proof
                    // remain independent of this administrator-funded entitlement.
                    ...(plan.key === 'internal' ? { $unset: { billingRecovery: '' } } : {}),
                }
            );
            if (!updated.matchedCount) throw new PlanAssignmentError('Billing changed during plan assignment. Retry shortly.');
        });

        await logAdminAction(
            admin._id.toString(),
            'USER_LIMITS_UPDATE',
            {
                action: 'PLAN_ASSIGNMENT',
                oldPlanKey: oldUser?.planKey,
                newPlanKey: plan.key,
                stripeSubscriptionPreserved: Boolean(oldUser.stripeSubscriptionId),
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
        logger.error('Failed to update user plan', error);
        return { success: false, message: error instanceof PlanAssignmentError || error instanceof BillingBusyError ? error.message : 'Database update failed' };
    }
}

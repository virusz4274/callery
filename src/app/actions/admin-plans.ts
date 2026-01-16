'use server';

import { getMongoDb, Collections } from '@/lib/mongodb';
import { Plan, CreatePlanInput, UpdatePlanInput, PlanResponse } from '@/lib/db/types';
import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';

function mapPlan(plan: Plan): PlanResponse {
    return {
        id: plan._id.toString(),
        name: plan.name,
        description: plan.description,
        stripePriceId: plan.stripePriceId,
        stripeStoragePriceId: plan.stripeStoragePriceId,
        stripeTranscriptionPriceId: plan.stripeTranscriptionPriceId,
        price: plan.price,
        currency: plan.currency,
        interval: plan.interval,
        limits: plan.limits,
        features: plan.features,
        isDefault: plan.isDefault,
        isActive: plan.isActive,
        createdAt: plan.createdAt.toISOString(),
        updatedAt: plan.updatedAt.toISOString(),
    };
}

export async function getPlans() {
    const db = await getMongoDb();
    const plans = await db.collection<Plan>(Collections.PLANS).find({}).sort({ price: 1 }).toArray();
    return plans.map(mapPlan);
}

export async function getPlanById(id: string) {
    const db = await getMongoDb();
    const plan = await db.collection<Plan>(Collections.PLANS).findOne({ _id: new ObjectId(id) });
    if (!plan) return null;
    return mapPlan(plan);
}

import { getCurrentAdmin } from '@/lib/admin-auth';
import { logAdminAction } from '@/app/actions/audit-log';

export async function createPlan(data: CreatePlanInput) {
    const admin = await getCurrentAdmin();
    if (!admin) throw new Error('Unauthorized');

    const db = await getMongoDb();

    // If this is set as default, unset others
    if (data.isDefault) {
        await db.collection(Collections.PLANS).updateMany({}, { $set: { isDefault: false } });
    }

    // Default dates
    const now = new Date();
    const newPlan: Plan = {
        _id: new ObjectId(),
        ...data,
        createdAt: now,
        updatedAt: now,
    };

    const result = await db.collection(Collections.PLANS).insertOne(newPlan);

    await logAdminAction(
        admin._id.toString(),
        'PLAN_CREATE',
        { planName: newPlan.name, planData: data },
        result.insertedId.toString(),
        'PLAN'
    );

    revalidatePath('/admin/plans');
    return mapPlan(newPlan);
}

export async function updatePlan(id: string, data: UpdatePlanInput) {
    const admin = await getCurrentAdmin();
    if (!admin) throw new Error('Unauthorized');

    const db = await getMongoDb();

    // If setting as default, unset others
    if (data.isDefault) {
        await db.collection(Collections.PLANS).updateMany(
            { _id: { $ne: new ObjectId(id) } },
            { $set: { isDefault: false } }
        );
    }

    const updateData = {
        ...data,
        updatedAt: new Date(),
    };

    await db.collection(Collections.PLANS).updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
    );

    await logAdminAction(
        admin._id.toString(),
        'PLAN_UPDATE',
        { planId: id, updates: data },
        id,
        'PLAN'
    );

    revalidatePath('/admin/plans');
}

export async function deletePlan(id: string) {
    const admin = await getCurrentAdmin();
    if (!admin) throw new Error('Unauthorized');

    const db = await getMongoDb();

    // Get plan details before deleting for log
    const plan = await db.collection<Plan>(Collections.PLANS).findOne({ _id: new ObjectId(id) });

    await db.collection(Collections.PLANS).deleteOne({ _id: new ObjectId(id) });

    await logAdminAction(
        admin._id.toString(),
        'PLAN_DELETE',
        { planName: plan?.name, planId: id },
        id,
        'PLAN'
    );

    revalidatePath('/admin/plans');
}

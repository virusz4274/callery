'use server';

import { AdminPlanSchema, validationFailure } from '@/lib/admin-validation';
import { logAdminAction } from '@/app/actions/audit-log';
import { CreatePlanInput, Plan, PlanResponse, UpdatePlanInput } from '@/lib/db/types';
import { parseObjectId, requireCurrentAdmin } from '@/lib/admin-auth';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';

function mapPlan(plan: Plan): PlanResponse {
    return {
        id: plan._id.toString(),
        key: plan.key,
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

function revalidatePlansPage() {
    revalidatePath('/admin/plans');
}

export async function getPlans() {
    await requireCurrentAdmin();

    const db = await getMongoDb();
    const plans = await db.collection<Plan>(Collections.PLANS).find({}).sort({ price: 1 }).toArray();

    return plans.map(mapPlan);
}

export async function getPlanById(id: string) {
    await requireCurrentAdmin();

    const db = await getMongoDb();
    const plan = await db.collection<Plan>(Collections.PLANS).findOne({ _id: parseObjectId(id, 'planId') });

    if (!plan) {
        return null;
    }

    return mapPlan(plan);
}

export async function createPlan(data: CreatePlanInput) {
    const admin = await requireCurrentAdmin();
    const validation = AdminPlanSchema.safeParse(data);
    if (!validation.success) return validationFailure(validation.error);

    const db = await getMongoDb();

    if (data.isDefault) {
        await db.collection(Collections.PLANS).updateMany({}, { $set: { isDefault: false } });
    }

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
        { planKey: newPlan.key, planName: newPlan.name, planData: data },
        result.insertedId.toString(),
        'PLAN'
    );

    revalidatePlansPage();
    return mapPlan(newPlan);
}

export async function updatePlan(id: string, data: UpdatePlanInput) {
    const admin = await requireCurrentAdmin();
    const validation = AdminPlanSchema.partial().safeParse(data);
    if (!validation.success) return validationFailure(validation.error);

    const db = await getMongoDb();
    const planObjectId = parseObjectId(id, 'planId');

    if (data.isDefault) {
        await db.collection(Collections.PLANS).updateMany(
            { _id: { $ne: planObjectId } },
            { $set: { isDefault: false } }
        );
    }

    await db.collection(Collections.PLANS).updateOne(
        { _id: planObjectId },
        {
            $set: {
                ...data,
                updatedAt: new Date(),
            },
        }
    );

    await logAdminAction(admin._id.toString(), 'PLAN_UPDATE', { planId: id, updates: data }, id, 'PLAN');

    revalidatePlansPage();
}

export async function deletePlan(id: string) {
    const admin = await requireCurrentAdmin();

    const db = await getMongoDb();
    const planObjectId = parseObjectId(id, 'planId');

    const plan = await db.collection<Plan>(Collections.PLANS).findOne({ _id: planObjectId });
    await db.collection(Collections.PLANS).deleteOne({ _id: planObjectId });

    await logAdminAction(
        admin._id.toString(),
        'PLAN_DELETE',
        { planKey: plan?.key, planName: plan?.name, planId: id },
        id,
        'PLAN'
    );

    revalidatePlansPage();
}

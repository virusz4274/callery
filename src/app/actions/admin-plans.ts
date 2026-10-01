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
    const admin = await getCurrentAdmin();
    if (!admin) {
        throw new Error('Unauthorized');
    }
    const db = await getMongoDb();
    const plans = await db.collection<Plan>(Collections.PLANS).find({}).sort({ price: 1 }).toArray();
    return plans.map(mapPlan);
}

export async function getPlanById(id: string) {
    const admin = await getCurrentAdmin();
    if (!admin) {
        throw new Error('Unauthorized');
    }
    if (!ObjectId.isValid(id)) return null;
    const db = await getMongoDb();
    const plan = await db.collection<Plan>(Collections.PLANS).findOne({ _id: new ObjectId(id) });
    if (!plan) return null;
    return mapPlan(plan);
}

import { getCurrentAdmin } from '@/lib/admin-auth';
import { logAdminAction } from '@/app/actions/audit-log';

function validatePlanInput(data: CreatePlanInput | UpdatePlanInput): string | null {
    if ('name' in data && (typeof data.name !== 'string' || !data.name.trim())) {
        return 'Plan name is required';
    }
    if ('price' in data && (typeof data.price !== 'number' || !Number.isFinite(data.price) || data.price < 0)) {
        return 'Price must be a non-negative number';
    }
    if ('interval' in data && !['monthly', 'yearly', 'lifetime'].includes(data.interval as string)) {
        return 'Invalid billing interval';
    }
    if ('limits' in data && data.limits) {
        const { storage, transcription } = data.limits;
        if (typeof storage !== 'number' || !Number.isFinite(storage) || storage < 0 ||
            typeof transcription !== 'number' || !Number.isFinite(transcription) || transcription < 0) {
            return 'Limits must be non-negative numbers';
        }
    }
    if ('features' in data && data.features && (!Array.isArray(data.features) || data.features.some(f => typeof f !== 'string'))) {
        return 'Features must be an array of strings';
    }
    return null;
}

export async function createPlan(data: CreatePlanInput) {
    const admin = await getCurrentAdmin();
    if (!admin) throw new Error('Unauthorized');

    if (!data.name?.trim()) throw new Error('Plan name is required');
    if (!data.limits) throw new Error('Plan limits are required');
    const validationError = validatePlanInput(data);
    if (validationError) throw new Error(validationError);

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

    if (!ObjectId.isValid(id)) throw new Error('Invalid plan id');
    const validationError = validatePlanInput(data);
    if (validationError) throw new Error(validationError);

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

    if (!ObjectId.isValid(id)) throw new Error('Invalid plan id');

    const db = await getMongoDb();

    // Get plan details before deleting for log
    const plan = await db.collection<Plan>(Collections.PLANS).findOne({ _id: new ObjectId(id) });
    if (!plan) throw new Error('Plan not found');

    // Protect the default plan and plans with subscribers.
    if (plan.isDefault) {
        throw new Error('Cannot delete the default plan. Set another plan as default first.');
    }
    const subscriberCount = await db.collection(Collections.USERS).countDocuments({ plan: plan.name });
    if (subscriberCount > 0) {
        throw new Error(`Cannot delete "${plan.name}": ${subscriberCount} user(s) are on this plan. Move them first.`);
    }

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

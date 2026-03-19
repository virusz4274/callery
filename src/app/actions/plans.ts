'use server';

import { getMongoDb, Collections } from '@/lib/mongodb';
import { Plan } from '@/lib/db/types';

export type PublicPlan = {
    id: string;
    name: string;
    description: string;
    price: number;
    currency: string;
    interval: 'monthly' | 'yearly' | 'lifetime';
    features: string[];
    stripePriceId: string;
    isPurchasable?: boolean;
};

export async function getPublishedPlans(): Promise<PublicPlan[]> {
    const db = await getMongoDb();
    // Fetch only active plans, excluding Free/Trial which are system defaults usually not "sold"
    // Also exclude plans without a stripePriceId
    const plans = await db.collection<Plan>(Collections.PLANS)
        .find({ isActive: true, stripePriceId: { $ne: '' } })
        .sort({ price: 1 })
        .toArray();

    return plans
        .filter(p => !['Free', 'Free Trial'].includes(p.name)) // Filter out system plans
        .map(p => ({
            id: p._id.toString(),
            name: p.name,
            description: p.description || '',
            price: p.price,
            currency: p.currency,
            interval: p.interval,
            features: p.features,
            stripePriceId: p.stripePriceId, // Needed for checkout
            isPurchasable: true,
        }));
}

export async function getUpgradeablePlans(): Promise<PublicPlan[]> {
    const db = await getMongoDb();
    const plans = await db.collection<Plan>(Collections.PLANS)
        .find({
            isActive: true,
            name: { $nin: ['Free', 'Free Trial', 'Internal'] },
        })
        .sort({ price: 1, name: 1 })
        .toArray();

    return plans.map((plan) => ({
        id: plan._id.toString(),
        name: plan.name,
        description: plan.description || '',
        price: plan.price,
        currency: plan.currency,
        interval: plan.interval,
        features: plan.features,
        stripePriceId: plan.stripePriceId,
        isPurchasable: Boolean(plan.stripePriceId?.trim()),
        }));
}

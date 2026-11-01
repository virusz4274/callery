'use server';

import { getMongoDb } from '@/lib/mongodb';
import { assertPublishedPlan } from '@/lib/stripe/catalog-publication';
import { getActiveCatalogBundle, type CatalogPlanEntry } from '@/lib/stripe/catalog-bundle';
import { billingEnabled } from '@/lib/config';
import { usagePricePresentation, type UsagePricePresentation } from '@/lib/stripe/usage-presentation';

export type PublicPlan = {
    id: string; key: string; name: string; description: string; price: number; currency: string;
    interval: 'monthly' | 'yearly' | 'lifetime' | 'trial'; features: string[]; stripePriceId: string;
    isPurchasable?: boolean; catalogVersion?: string; storageBytes?: number; weightedMinutes?: number;
    usagePricing?: UsagePricePresentation;
};

async function publicPlan(entry: CatalogPlanEntry, db: Awaited<ReturnType<typeof getMongoDb>>): Promise<PublicPlan> {
    const plan = entry.plan;
    const usagePricing = usagePricePresentation(plan.interval === 'lifetime' ? 'lifetime' : 'recurring', entry.usageTariffs);
    let purchasable = false;
    try { await assertPublishedPlan(plan, db); purchasable = usagePricing.ready; }
    catch { /* Reviewed prices remain visible while cost or acceptance evidence needs attention. */ }
    return { id: plan._id.toString(), key: plan.key, name: plan.name, description: plan.description || '', price: plan.price,
        currency: plan.currency, interval: plan.interval, features: plan.features, stripePriceId: plan.stripePriceId,
        isPurchasable: purchasable, catalogVersion: entry.catalogVersion, storageBytes: plan.limits.storage,
        weightedMinutes: plan.limits.transcription / 60, usagePricing };
}

export async function getPublishedPlans(): Promise<PublicPlan[]> {
    if (!billingEnabled()) return [];
    const db = await getMongoDb(), bundle = await getActiveCatalogBundle(db);
    if (!bundle) return [];
    return Promise.all(bundle.plans.filter(entry => entry.plan.isActive && !entry.plan.isDefault && !entry.plan.archivedAt)
        .sort((a, b) => a.plan.price - b.plan.price || a.plan.name.localeCompare(b.plan.name)).map(entry => publicPlan(entry, db)));
}

export async function getUpgradeablePlans(): Promise<PublicPlan[]> {
    return getPublishedPlans();
}

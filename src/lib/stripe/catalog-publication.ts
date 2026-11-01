import 'server-only';
import { isDeepStrictEqual } from 'node:util';
import type { Db } from 'mongodb';
import type Stripe from 'stripe';
import type { Plan, User } from '@/lib/db/types';
import { BILLING_CATALOG, type UsagePricingTier } from './catalog';
import { getActiveCatalogBundle, getPublishedCatalogBundle } from './catalog-bundle';
import { assertCatalogBillingReady } from './launch-gate';
import { assertUsageTariff, type UsageTariffPair, type UsageTariffSnapshot } from './usage-tariff';

export interface PublishedCatalog {
    _id: string; bundleId?: string; tariffVersion: string; costVersion?: string; effectiveAt: Date; publishedAt?: Date;
    tariff: typeof BILLING_CATALOG; costFingerprint?: string; usageTariffs: UsageTariffPair;
    plan: Plan;
}
/** Editing a managed plan saves a draft. Only the complete reviewed bundle can publish financial terms. */
export async function preparePublishedPlan(plan: Plan, db: Db, stripe?: Stripe): Promise<Plan> {
    void db; void stripe;
    return { ...plan, billingCatalogVersion: undefined, billingCatalogBundleId: undefined, billingPublishedAt: undefined, usageTariffs: undefined };
}

export async function assertPublishedPlan(plan: Plan, db: Db): Promise<PublishedCatalog> {
    const active = await getActiveCatalogBundle(db);
    const entry = active?.plans.find(row => row.plan.key === plan.key && row.plan.interval === plan.interval && row.plan.stripePriceId === plan.stripePriceId);
    if (!active || !entry) throw new Error('Review and publish this offer in the complete Stripe catalog before selling it.');
    assertCatalogBillingReady(active.costVersion, [entry.plan.stripePriceId, entry.usageTariffs.storage.priceId, entry.usageTariffs.transcription.priceId], active.acceptanceEvidence,
        { catalogVersion: active._id, costFingerprint: active.costFingerprint, stripeAccountId: active.stripeAccountId, livemode: active.livemode });
    const row = await db.collection<PublishedCatalog>('billing_catalog_versions').findOne({ _id: entry.catalogVersion });
    if (!row || !isDeepStrictEqual(row.usageTariffs, entry.usageTariffs)) throw new Error('The published offer archive requires reconciliation.');
    return row;
}

/** A usage rollout can change rates independently of the original paid base contract. */
export async function assertPublishedUsageMapping(user: User, db: Db, ids: { storage: string; transcription: string }): Promise<PublishedCatalog> {
    const pair = user.billingUsageTariffs;
    if (!pair || pair.storage.priceId !== ids.storage || pair.transcription.priceId !== ids.transcription) throw new Error('Verify the purchased published usage catalog before accepting payment or provider work.');
    await assertArchivedUsageTariff(pair.storage, db); await assertArchivedUsageTariff(pair.transcription, db);
    const row = await db.collection<PublishedCatalog>('billing_catalog_versions').findOne({ bundleId: pair.storage.catalogVersion,
        'usageTariffs.storage.id': pair.storage.id, 'usageTariffs.transcription.id': pair.transcription.id,
        ...(user.billingUsageCatalogVersion ? { _id: user.billingUsageCatalogVersion } : {}) });
    if (!row) throw new Error('The verified usage catalog archive is unavailable.');
    const bundle = await getPublishedCatalogBundle(row.bundleId!, db);
    if (!bundle) throw new Error('The purchased usage catalog was never published.');
    assertCatalogBillingReady(undefined, [pair.storage.priceId, pair.transcription.priceId], bundle.acceptanceEvidence,
        { catalogVersion: bundle._id, costFingerprint: bundle.costFingerprint, stripeAccountId: bundle.stripeAccountId, livemode: bundle.livemode });
    return row;
}

export async function assertArchivedUsageTariff(tariff: UsageTariffSnapshot, db: Db): Promise<void> {
    assertUsageTariff(tariff);
    const bundle = await getPublishedCatalogBundle(tariff.catalogVersion, db);
    if (!bundle || !bundle.plans.some(entry => isDeepStrictEqual(entry.usageTariffs[tariff.kind], tariff))) {
        throw new Error('The immutable accepted usage tariff is not present in a published catalog archive.');
    }
}
export function publishedUsageTier(snapshot: PublishedCatalog): UsagePricingTier { return snapshot.plan.interval === 'lifetime' ? 'lifetime' : 'recurring'; }
export function publishedUsageRates(snapshot: PublishedCatalog) { return snapshot.usageTariffs; }

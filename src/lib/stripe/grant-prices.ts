import 'server-only';
import type { Db } from 'mongodb';
import type Stripe from 'stripe';
import type { Plan, User } from '@/lib/db/types';
import type { UsagePricingTier } from './catalog';
import { assertPublishedPlan, assertPublishedUsageMapping } from './catalog-publication';
import { BillingConfigurationError, validateMeterPrices } from './metering';
import { getActiveCatalogBundle, getPublishedCatalogBundle } from './catalog-bundle';
import type { UsageTariffPair } from './usage-tariff';
import { activeGrantIdsForUser } from './grant-transfer';
import { stripeObjectId } from './objects';

export interface ApprovedUsageMeterPair { tier: UsagePricingTier; ids: { storage: string; transcription: string }; catalogVersion: string; tariffs?: UsageTariffPair }
export interface ApprovedUsageGrantPrices { current: { storage: string; transcription: string }; pairs: ApprovedUsageMeterPair[]; priceIds: string[] }
function approvedPair(tariffs: UsageTariffPair): ApprovedUsageMeterPair { return { tier: tariffs.storage.usageTier,
    ids: { storage: tariffs.storage.priceId, transcription: tariffs.transcription.priceId }, catalogVersion: tariffs.storage.catalogVersion, tariffs }; }
async function completeMapping(db: Db, stripe: Stripe, current?: UsageTariffPair, user?: User): Promise<ApprovedUsageGrantPrices> {
    const active = await getActiveCatalogBundle(db);
    // Sales pauses do not remove existing customers' approved funding scopes.
    const bundle = active && await getPublishedCatalogBundle(active._id, db);
    if (!bundle) throw new BillingConfigurationError('Publish the complete recurring and Lifetime quantity catalog before accepting managed payments.');
    const all = bundle.plans.map(entry => entry.usageTariffs);
    if (current) all.unshift(current);
    if (user?.billingUsagePriceRollout?.noticedAt) {
        const pending = await getPublishedCatalogBundle(user.billingUsagePriceRollout.targetBundleId, db);
        if (pending) all.push(...pending.plans.map(entry => entry.usageTariffs));
    }
    const pairs = [...new Map(all.map(pair => [`${pair.storage.priceId}:${pair.transcription.priceId}`, approvedPair(pair)])).values()];
    if (!pairs.some(pair => pair.tier === 'recurring') || !pairs.some(pair => pair.tier === 'lifetime')) throw new BillingConfigurationError('Both recurring and Lifetime quantity prices must be published.');
    const priceIds = [...new Set(pairs.flatMap(pair => [pair.ids.storage, pair.ids.transcription]))].sort();
    await validateApprovedGrantPrices(pairs, priceIds, stripe);
    return { current: approvedPair(current || bundle.plans[0].usageTariffs).ids, pairs, priceIds };
}
export async function resolveApprovedUsageGrantPrices(user: User, db: Db, stripe: Stripe): Promise<ApprovedUsageGrantPrices> {
    if (!user.billingUsageTariffs) throw new BillingConfigurationError('Verify the purchased usage tariff before accepting prepaid credit.');
    const pair = user.billingUsageTariffs;
    await assertPublishedUsageMapping(user, db, { storage: pair.storage.priceId, transcription: pair.transcription.priceId });
    return completeMapping(db, stripe, pair, user);
}
export async function assertCompletePublishedUsageCatalog(plan: Plan, db: Db, stripe: Stripe): Promise<void> {
    const published = await assertPublishedPlan(plan, db);
    await completeMapping(db, stripe, published.usageTariffs);
}
export async function validateApprovedGrantPrices(pairs: ApprovedUsageMeterPair[] | undefined, priceIds: string[] | undefined, stripe: Stripe): Promise<void> {
    const expected = pairs && [...new Set(pairs.flatMap(pair => [pair.ids.storage, pair.ids.transcription]))].sort();
    if (!pairs?.length || !priceIds?.length || new Set(priceIds).size !== priceIds.length
        || JSON.stringify(expected) !== JSON.stringify([...priceIds].sort()) || pairs.some(pair => !pair.tariffs)) throw new BillingConfigurationError('The frozen approved prepaid scope requires review.');
    for (const pair of pairs) await validateMeterPrices(stripe, pair.ids, 'usd', undefined, pair.tier, pair.tariffs, true);
}
export async function assertPrepaidGrantsCoverTarget(user: User, ids: { storage: string; transcription: string }, stripe: Stripe, db?: Db): Promise<void> {
    if (!db) throw new BillingConfigurationError('Verify prepaid grant lineage before changing usage rates.');
    for (const grantId of await activeGrantIdsForUser(user, { db, stripe })) {
        const grant = await stripe.billing.creditGrants.retrieve(grantId), scope = grant.applicability_config.scope;
        const approved = scope.prices?.map(price => price.id) || [];
        if (stripeObjectId(grant.customer) !== user.stripeCustomerId || grant.voided_at || grant.expires_at
            || (scope.price_type !== 'metered' && (!approved.includes(ids.storage) || !approved.includes(ids.transcription)))) {
            throw new BillingConfigurationError('Legacy prepaid credit cannot cover these usage Prices. Reconcile its existing scope before this change.');
        }
    }
}

/** Broad metered grants are safe only on the app's dedicated billing customer. */
export async function assertDedicatedUsageCustomer(user: User, db: Db, stripe: Stripe): Promise<void> {
    if (!user.stripeCustomerId) throw new BillingConfigurationError('A verified application billing customer is required.');
    const customer = await stripe.customers.retrieve(user.stripeCustomerId);
    if (customer.deleted || customer.metadata?.authSubject !== user.authSubject
        || customer.metadata?.userId && customer.metadata.userId !== user._id.toString()) {
        throw new BillingConfigurationError('Usage credit requires a dedicated application-owned Stripe customer.');
    }
    const snapshots = await db.collection<{ plan: Plan }>('billing_catalog_versions').find({}).toArray();
    const allowed = new Set(snapshots.flatMap(row => [row.plan.stripePriceId, row.plan.stripeStoragePriceId, row.plan.stripeTranscriptionPriceId]).filter(Boolean));
    const bundles = await db.collection<{ plans: { plan: Plan }[] }>('billing_catalog_bundles').find({ state: 'published' }).toArray();
    for (const bundle of bundles) for (const entry of bundle.plans) for (const id of [entry.plan.stripePriceId, entry.plan.stripeStoragePriceId, entry.plan.stripeTranscriptionPriceId]) if (id) allowed.add(id);
    for (const tariff of [user.billingUsageTariffs?.storage, user.billingUsageTariffs?.transcription]) if (tariff) allowed.add(tariff.priceId);
    if (user.stripePriceId) allowed.add(user.stripePriceId);
    let after: string | undefined;
    for (;;) {
        const page = await stripe.subscriptions.list({ customer: user.stripeCustomerId, status: 'all', limit: 100, ...(after ? { starting_after: after } : {}) });
        for (const subscription of page.data) {
        if (subscription.status === 'canceled' || subscription.status === 'incomplete_expired') continue;
        if (stripeObjectId(subscription.customer) !== user.stripeCustomerId || subscription.items.has_more
            || subscription.items.data.some(item => !allowed.has(item.price.id))) {
            throw new BillingConfigurationError('This Stripe customer contains subscriptions outside the approved application catalog.');
        }
        }
        if (!page.has_more) break;
        after = page.data.at(-1)?.id;
        if (!after) throw new BillingConfigurationError('The customer subscription inventory is incomplete.');
    }
}

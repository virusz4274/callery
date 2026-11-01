import 'server-only';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { ObjectId, type Db } from 'mongodb';
import type Stripe from 'stripe';
import type { Plan } from '@/lib/db/types';
import { Collections } from '@/lib/mongodb';
import { readUsageTariffs, validateCheckoutPlan } from './metering';
import { assertCatalogBillingReady, validateBillingEvidence } from './launch-gate';
import type { BillingLaunchEvidence } from './launch-gate';
import type { UsageTariffPair } from './usage-tariff';
import type { PublishedCatalog } from './catalog-publication';
import { BILLING_CATALOG } from './catalog';

export const CATALOG_BUNDLES = 'billing_catalog_bundles', CATALOG_STATE = 'billing_catalog_state';
export interface CatalogPlanEntry { plan: Plan; usageTariffs: UsageTariffPair; catalogVersion: string }
export interface BillingCatalogBundle {
    _id: string; schemaVersion: 1; state: 'draft' | 'published'; createdAt: Date; publishedAt?: Date;
    stripeAccountId: string; livemode: boolean; costVersion?: string; costFingerprint?: string;
    plans: CatalogPlanEntry[]; importedBy?: string; publishedBy?: string;
    acceptanceEvidence?: BillingLaunchEvidence;
    stripeObjects: { prices: Record<string, unknown>[]; meters: Record<string, unknown>[] };
}
export interface CatalogPublicationOutbox { previousBundleId?: string; newBundleId: string; createdAt: Date }
export interface CatalogState { _id: 'active'; bundleId?: string; revision: number; publicationOutbox?: CatalogPublicationOutbox; pausedPlanKeys?: string[] }
export interface StripeCatalogImport {
    plans: { key: string; stripePriceId: string; limits?: Plan['limits']; features?: string[] }[];
    usagePriceIds: { recurring: { storage: string; transcription: string }; lifetime: { storage: string; transcription: string } };
    expectedStripeAccountId?: string;
}
function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function requireLimits(limits: Plan['limits'], lifetime: boolean) {
    if (!limits || !Number.isSafeInteger(limits.storage) || limits.storage < 0 || !Number.isSafeInteger(limits.transcription) || limits.transcription < 0
        || (lifetime && (limits.storage || limits.transcription))) throw new Error('Allowances must be integer bytes and weighted seconds; Lifetime has no recurring allowance.');
}
function publicPrice(price: Stripe.Price) {
    return { id: price.id, active: price.active, livemode: price.livemode, type: price.type, currency: price.currency,
        product: typeof price.product === 'string' ? price.product : price.product.id,
        unitAmountDecimal: String(price.unit_amount_decimal ?? price.unit_amount), recurring: price.recurring, taxBehavior: price.tax_behavior,
        ...(typeof price.product === 'object' && !('deleted' in price.product) ? { productDetails: { name: price.product.name,
            description: price.product.description, storageBytes: price.product.metadata.vosift_storage_bytes, weightedSeconds: price.product.metadata.vosift_weighted_seconds } } : {}) };
}
export async function getPublishedCatalogBundle(id: string, db: Db): Promise<BillingCatalogBundle | null> {
    return db.collection<BillingCatalogBundle>(CATALOG_BUNDLES).findOne({ _id: id, state: 'published' });
}
export async function getActiveCatalogBundle(db: Db): Promise<BillingCatalogBundle | null> {
    const state = await db.collection<CatalogState>(CATALOG_STATE).findOne({ _id: 'active' });
    const bundle = state?.bundleId ? await getPublishedCatalogBundle(state.bundleId, db) : null;
    return bundle && state?.pausedPlanKeys?.length ? { ...bundle, plans: bundle.plans.filter(entry => !state.pausedPlanKeys!.includes(entry.plan.key)) } : bundle;
}
export async function pausePublishedOffer(key: string, paused: boolean, db: Db): Promise<void> {
    await db.collection<CatalogState>(CATALOG_STATE).updateOne({ _id: 'active' }, paused
        ? { $addToSet: { pausedPlanKeys: key } } : { $pull: { pausedPlanKeys: key } });
}
export async function resolveCatalogPlan(plan: Plan | string, db: Db): Promise<CatalogPlanEntry> {
    const bundle = await getActiveCatalogBundle(db), key = typeof plan === 'string' ? plan : plan.key;
    const entry = bundle?.plans.find(row => row.plan.key === key && (typeof plan === 'string' || row.plan.interval === plan.interval));
    if (!entry) throw new Error('Review and publish the complete Stripe catalog before selling this offer.');
    return entry;
}
export async function findHistoricalCatalogPlan(priceId: string, db: Db, catalogVersion?: string): Promise<PublishedCatalog | null> {
    const rows = await db.collection<PublishedCatalog>('billing_catalog_versions').find({ 'plan.stripePriceId': priceId, publishedAt: { $exists: true },
        ...(catalogVersion ? { _id: catalogVersion } : {}) }).sort({ publishedAt: -1, _id: -1 }).limit(1).toArray();
    return rows[0] || null;
}

/** Stripe amounts are imported, not copied from client-supplied financial fields. */
export async function importStripeCatalogDraft(input: StripeCatalogImport, db: Db, stripe: Stripe, importedBy?: string): Promise<BillingCatalogBundle> {
    if (!input || !Array.isArray(input.plans) || input.plans.length < 3 || input.plans.length > 12
        || new Set(input.plans.map(plan => plan.key)).size !== input.plans.length
        || input.plans.some(plan => !/^[a-z][a-z0-9-]{0,63}$/.test(plan.key) || !plan.stripePriceId?.startsWith('price_'))) throw new Error('Import a complete catalog with unique plan keys and Stripe price IDs.');
    for (const key of ['standard', 'pro', 'lifetime']) if (!input.plans.some(plan => plan.key === key)) throw new Error('Include Standard, Pro and Lifetime in the catalog bundle.');
    const ids = Object.values(input.usagePriceIds || {}).flatMap(pair => [pair.storage, pair.transcription]);
    if (ids.length !== 4 || ids.some(id => !id?.startsWith('price_')) || new Set(ids).size !== 4) throw new Error('Configure four distinct quantity meter prices for recurring and Lifetime usage.');
    const account = await stripe.accounts.retrieve(null);
    if (!account.id || input.expectedStripeAccountId && account.id !== input.expectedStripeAccountId) throw new Error('The Stripe account differs from the catalog import target.');
    const prices = await Promise.all([...new Set([...input.plans.map(plan => plan.stripePriceId), ...ids])].map(id => stripe.prices.retrieve(id, { expand: ['product'] })));
    const livemode = prices[0].livemode;
    if (prices.some(price => price.livemode !== livemode || price.currency !== 'usd' || !price.active)) throw new Error('All catalog prices must be active USD prices in the same Stripe mode.');
    const version = hash({ schemaVersion: 1, stripeAccountId: account.id, livemode, input, prices: prices.map(publicPrice) });
    const pairs = { recurring: await readUsageTariffs(stripe, input.usagePriceIds.recurring, version, 'recurring'),
        lifetime: await readUsageTariffs(stripe, input.usagePriceIds.lifetime, version, 'lifetime') };
    const now = new Date(), entries: CatalogPlanEntry[] = [];
    for (const selected of input.plans) {
        const price = prices.find(row => row.id === selected.stripePriceId)!;
        if (price.billing_scheme !== 'per_unit' || price.transform_quantity || price.unit_amount == null || !Number.isSafeInteger(price.unit_amount) || price.unit_amount <= 0
            || (price.type === 'recurring' && (price.recurring?.usage_type !== 'licensed' || !['month', 'year'].includes(price.recurring.interval) || price.recurring.interval_count !== 1))) throw new Error('Base offers require positive whole-cent licensed monthly/yearly or one-time Stripe prices.');
        const product = typeof price.product === 'object' && !('deleted' in price.product) ? price.product : null;
        if (!product || !product.active) throw new Error('Import active Stripe products with their prices.');
        const interval = price.type === 'one_time' ? 'lifetime' : price.recurring!.interval === 'year' ? 'yearly' : 'monthly';
        if ((selected.key === 'lifetime') !== (interval === 'lifetime')) throw new Error('Lifetime must use a one-time base; recurring offers require recurring base prices.');
        const existing = await db.collection<Plan>(Collections.PLANS).findOne({ key: selected.key });
        const limits = selected.limits || (product.metadata.vosift_storage_bytes !== undefined && product.metadata.vosift_weighted_seconds !== undefined
            ? { storage: Number(product.metadata.vosift_storage_bytes), transcription: Number(product.metadata.vosift_weighted_seconds) } : existing?.limits);
        if (!limits) throw new Error('Set storage bytes and weighted seconds in the Stripe product metadata or import allowances.');
        requireLimits(limits, interval === 'lifetime');
        const pair = interval === 'lifetime' ? pairs.lifetime : pairs.recurring;
        const plan: Plan = { _id: existing?._id || new ObjectId(), key: selected.key, name: product.name, description: product.description || '',
            stripePriceId: price.id, stripeStoragePriceId: pair.storage.priceId, stripeTranscriptionPriceId: pair.transcription.priceId,
            price: price.unit_amount / 100, currency: 'usd', interval, limits, features: selected.features || existing?.features || [],
            isDefault: false, isActive: true, createdAt: existing?.createdAt || now, updatedAt: now, billingCatalogVersion: `${version}:${selected.key}`,
            billingCatalogBundleId: version, usageTariffs: pair };
        // All offer rows share the immutable bundle identity; lookups also key by plan key/price.
        entries.push({ plan, usageTariffs: pair, catalogVersion: `${version}:${selected.key}` });
    }
    const meters = await Promise.all([...new Set(Object.values(pairs).flatMap(pair => [pair.storage.meterId, pair.transcription.meterId]))].map(id => stripe.billing.meters.retrieve(id)));
    const bundle: BillingCatalogBundle = { _id: version, schemaVersion: 1, state: 'draft', createdAt: now, stripeAccountId: account.id, livemode,
        plans: entries, ...(importedBy ? { importedBy } : {}),
        stripeObjects: { prices: prices.map(publicPrice), meters: meters.map(meter => ({ id: meter.id, event_name: meter.event_name,
            default_aggregation: meter.default_aggregation, customer_mapping: meter.customer_mapping, value_settings: meter.value_settings, event_time_window: meter.event_time_window })) } };
    await db.collection<BillingCatalogBundle>(CATALOG_BUNDLES).updateOne({ _id: version }, { $setOnInsert: bundle }, { upsert: true });
    return (await db.collection<BillingCatalogBundle>(CATALOG_BUNDLES).findOne({ _id: version }))!;
}

/** Archive first, then activate the entire financial catalog with one standalone-Mongo CAS. */
export async function publishCatalogDraft(id: string, db: Db, stripe: Stripe, publishedBy?: string, acceptanceEvidence?: BillingLaunchEvidence): Promise<BillingCatalogBundle> {
    const bundle = await db.collection<BillingCatalogBundle>(CATALOG_BUNDLES).findOne({ _id: id });
    if (!bundle) throw new Error('Catalog draft not found.');
    const current = await db.collection<CatalogState>(CATALOG_STATE).findOne({ _id: 'active' });
    if (current?.bundleId === id) return bundle;
    if (current?.publicationOutbox) throw new Error('The previous catalog rollout is still being scheduled. Retry after reconciliation.');
    const account = await stripe.accounts.retrieve(null);
    if (account.id !== bundle.stripeAccountId) throw new Error('Stripe account changed after import.');
    for (const entry of bundle.plans) {
        const base = await validateCheckoutPlan(stripe, entry.plan);
        if (base.livemode !== bundle.livemode || base.unit_amount !== Math.round(entry.plan.price * 100)) throw new Error('Stripe prices changed after review. Import a fresh draft.');
    }
    const evidence = acceptanceEvidence || bundle.acceptanceEvidence;
    assertCatalogBillingReady(undefined, bundle.stripeObjects.prices.map(row => String(row.id)), evidence,
        { catalogVersion: id, costFingerprint: bundle.costFingerprint, stripeAccountId: bundle.stripeAccountId, livemode: bundle.livemode });
    const publishedAt = new Date();
    for (const entry of bundle.plans) {
        const rowId = `${id}:${entry.plan.key}`;
        const row: PublishedCatalog = { _id: rowId, bundleId: id, tariffVersion: BILLING_CATALOG.version, tariff: BILLING_CATALOG,
            effectiveAt: publishedAt, publishedAt,
            usageTariffs: entry.usageTariffs, plan: entry.plan };
        await db.collection<PublishedCatalog>('billing_catalog_versions').updateOne({ _id: rowId }, { $setOnInsert: row }, { upsert: true });
    }
    await db.collection<BillingCatalogBundle>(CATALOG_BUNDLES).updateOne({ _id: id }, { $set: { state: 'published', publishedAt,
        ...(evidence ? { acceptanceEvidence: evidence } : {}), ...(publishedBy ? { publishedBy } : {}) } });
    const next = { bundleId: id, revision: (current?.revision || 0) + 1,
        publicationOutbox: { ...(current?.bundleId ? { previousBundleId: current.bundleId } : {}), newBundleId: id, createdAt: publishedAt } };
    if (!current) {
        try { await db.collection<CatalogState>(CATALOG_STATE).insertOne({ _id: 'active', ...next }); }
        catch { throw new Error('Another catalog was published concurrently. Review the current catalog before retrying.'); }
    } else {
        const changed = await db.collection<CatalogState>(CATALOG_STATE).updateOne({ _id: 'active', revision: current.revision, bundleId: current.bundleId,
            publicationOutbox: { $exists: false } }, { $set: next });
        if (!changed.matchedCount) throw new Error('Another catalog was published concurrently. Review before retrying.');
    }
    return { ...bundle, state: 'published', publishedAt };
}

/** Renew acceptance proof independently of immutable financial terms and rate notices. */
export async function refreshCatalogAcceptanceEvidence(id: string, evidence: BillingLaunchEvidence, db: Db, stripe: Stripe, reviewedBy?: string): Promise<BillingCatalogBundle> {
    const bundle = await getPublishedCatalogBundle(id, db);
    if (!bundle) throw new Error('Choose a published catalog before refreshing acceptance evidence.');
    const account = await stripe.accounts.retrieve(null);
    if (account.id !== bundle.stripeAccountId) throw new Error('Stripe account changed after publication.');
    validateBillingEvidence(undefined, bundle.stripeObjects.prices.map(row => String(row.id)), evidence,
        { catalogVersion: id, costFingerprint: bundle.costFingerprint, stripeAccountId: bundle.stripeAccountId, livemode: bundle.livemode });
    if (bundle.acceptanceEvidence && Date.parse(evidence.verifiedAt) < Date.parse(bundle.acceptanceEvidence.verifiedAt)) throw new Error('Acceptance evidence cannot replace a newer verified record.');
    const audit = { _id: `${id}:${hash(evidence)}`, bundleId: id, evidence, recordedAt: new Date(), ...(reviewedBy ? { reviewedBy } : {}) };
    await db.collection<typeof audit>('billing_catalog_acceptance').updateOne({ _id: audit._id }, { $setOnInsert: audit }, { upsert: true });
    const changed = await db.collection<BillingCatalogBundle>(CATALOG_BUNDLES).updateOne({ _id: id, state: 'published',
        ...(bundle.acceptanceEvidence ? { 'acceptanceEvidence.verifiedAt': bundle.acceptanceEvidence.verifiedAt } : { acceptanceEvidence: { $exists: false } }) },
    { $set: { acceptanceEvidence: evidence } });
    if (!changed.matchedCount) throw new Error('Acceptance evidence changed concurrently. Reload before retrying.');
    return { ...bundle, acceptanceEvidence: evidence };
}

export function sameTariffs(left: UsageTariffPair | undefined, right: UsageTariffPair): boolean { return isDeepStrictEqual(left, right); }

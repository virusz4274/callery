import 'server-only';
import type { Db, Filter } from 'mongodb';
import { Collections } from '@/lib/mongodb';
import type { User } from '@/lib/db/types';
import { BILLING_CATALOG, type UsagePricingTier } from './catalog';
import { CATALOG_BUNDLES, CATALOG_STATE, type BillingCatalogBundle, type CatalogState } from './catalog-bundle';
import { getCatalogDiscoveryStatus } from './catalog-discovery';
import { USAGE_PRICE_ROLLOUTS, type UsagePriceRollout } from './usage-price-rollout';
import { ATOMS_PER_CENT, assertUsageTariff, formatUsdAtoms, sameUsageTariffRate, type UsageTariffPair, type UsageTariffSnapshot } from './usage-tariff';

const MAX_PLANS = 12, MAX_PENDING = 50, QUERY_TIMEOUT_MS = 5000;
const states = ['notifying', 'scheduled', 'preparing', 'prepared', 'applying', 'applied', 'canceled', 'needs_review'] as const;
const pendingFilter = { state: { $nin: ['applied', 'canceled'] as const } };
const paidAccounts: Filter<User> = { 'billingEntitlement.source': { $in: ['subscription', 'lifetime'] }, stripeCustomerId: { $exists: true },
    stripeSubscriptionId: { $exists: true }, disabled: { $ne: true }, 'softDelete.isDeleted': { $ne: true } };
export interface CatalogRateDisplay {
    priceId: string; centsPerUnit: string; usdPerUnit: string; minimumUsd: string; minimumQuantity: number;
    usdPerGiB?: string; providers?: { provider: string; multiplier: number; usdPerMinute: string }[];
}
export interface CatalogRateChange {
    tier: UsagePricingTier; kind: 'storage' | 'transcription'; unit: string; previous?: CatalogRateDisplay; proposed: CatalogRateDisplay;
    changed: boolean; increased: boolean; description: string;
}
export interface CatalogReview {
    targetBundleId?: string; activeBundleId?: string; state?: 'draft' | 'published'; stripeAccountId?: string; livemode?: boolean;
    rates: CatalogRateChange[];
    validation: { passed: boolean; errors: string[] };
    plans: { key: string; name: string; interval: string; previousUsd?: string; proposedUsd: string; changed: boolean;
        previousStorageBytes?: number; storageBytes: number; previousWeightedSeconds?: number; weightedSeconds: number }[];
    customers: { affected: number | null; byTier: Record<UsagePricingTier, number | null>; fundingTransfers: number | null; billingReviews: number | null; error?: string };
    rollouts: { total: number | null; targetTotal: number | null; byState: Record<string, number | null>; noticed: number | null;
        emailSent: number | null; noticeMissing: number | null; blocked: number | null; earliestActivation?: string; latestActivation?: string;
        pending: { id: string; state: string; targetBundleId: string; effectiveAt?: string; noticedAt?: string; lastError?: string }[]; truncated: boolean; error?: string };
    discovery: { revision: number; refreshedRevision?: number; checkedAt?: string; changedAt?: string; stale: boolean; lastError?: string; priceCount: number };
    warnings: string[];
}
function errorMessage(error: unknown): string { return (error instanceof Error ? error.message : 'Review data is unavailable.').slice(0, 500); }
function iso(value: Date | undefined): string | undefined { return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : undefined; }
function familyPair(bundle: BillingCatalogBundle | null, tier: UsagePricingTier): UsageTariffPair | undefined {
    return bundle?.plans.find(entry => entry.usageTariffs.storage.usageTier === tier)?.usageTariffs;
}
function rateDisplay(tariff: UsageTariffSnapshot): CatalogRateDisplay {
    const unitAtoms = BigInt(tariff.unitPriceAtoms);
    return { priceId: tariff.priceId, centsPerUnit: tariff.unitAmountDecimal, usdPerUnit: formatUsdAtoms(unitAtoms),
        minimumQuantity: tariff.minimumQuantity, minimumUsd: formatUsdAtoms(unitAtoms * BigInt(tariff.minimumQuantity)),
        ...(tariff.kind === 'storage' ? { usdPerGiB: formatUsdAtoms(unitAtoms * BigInt(1000)) }
            : { providers: Object.entries(BILLING_CATALOG.providers).map(([provider, definition]) => ({ provider, multiplier: definition.multiplier,
                usdPerMinute: formatUsdAtoms(unitAtoms * BigInt(4 * definition.multiplier)) })) }) };
}
function rateChanges(bundle: BillingCatalogBundle | null, active: BillingCatalogBundle | null): CatalogRateChange[] {
    const result: CatalogRateChange[] = [];
    for (const tier of ['recurring', 'lifetime'] as const) {
        const next = familyPair(bundle, tier), old = familyPair(active, tier); if (!next) continue;
        for (const kind of ['transcription', 'storage'] as const) {
            const proposed = rateDisplay(next[kind]), previous = old ? rateDisplay(old[kind]) : undefined;
            const unit = kind === 'storage' ? 'milliGiB of monthly peak' : 'weighted 15-second block';
            result.push({ tier, kind, unit, ...(previous ? { previous } : {}), proposed,
                changed: !old || !sameUsageTariffRate(old[kind], next[kind]) || old[kind].minimumQuantity !== next[kind].minimumQuantity,
                increased: Boolean(old && BigInt(next[kind].unitPriceAtoms) > BigInt(old[kind].unitPriceAtoms)),
                description: `${tier === 'lifetime' ? 'Lifetime' : 'Recurring'} ${kind}: ${previous ? `${previous.centsPerUnit} to ` : ''}${proposed.centsPerUnit} USD cents per ${unit}.` });
        }
    }
    return result;
}
function baseUsd(price: number): string {
    const minor = Math.round(price * 100);
    if (!Number.isSafeInteger(minor) || minor < 0) throw new Error('The imported base price is invalid.');
    return formatUsdAtoms(BigInt(minor) * ATOMS_PER_CENT);
}
/** A review validates the imported billing contract, never provider economics. */
function blockingValidation(bundle: BillingCatalogBundle | null): CatalogReview['validation'] {
    const errors: string[] = [];
    if (!bundle) return { passed: false, errors: ['Import a complete Stripe catalog draft before publication.'] };
    for (const key of ['standard', 'pro', 'lifetime']) if (!bundle.plans.some(entry => entry.plan.key === key)) errors.push(`The catalog requires ${key}.`);
    for (const entry of bundle.plans) {
        try {
            const plan = entry.plan, pair = entry.usageTariffs, lifetime = plan.interval === 'lifetime';
            if (plan.currency !== 'usd' || !Number.isFinite(plan.price) || plan.price <= 0 || !Number.isSafeInteger(Math.round(plan.price * 100))) throw new Error('A positive USD base Price is required.');
            if (![plan.limits.storage, plan.limits.transcription].every(value => Number.isSafeInteger(value) && value >= 0)
                || lifetime && (plan.limits.storage || plan.limits.transcription)) throw new Error('Invalid included allowances.');
            for (const kind of ['storage', 'transcription'] as const) {
                const tariff = pair[kind]; assertUsageTariff(tariff);
                if (tariff.kind !== kind || tariff.usageTier !== (lifetime ? 'lifetime' : 'recurring')) throw new Error('The usage tariff has the wrong plan family or unit.');
            }
        } catch (error) { errors.push(`${entry.plan.name}: ${errorMessage(error)}`); }
    }
    return { passed: !errors.length, errors: [...new Set(errors)] };
}
async function count(db: Db, collection: string, filter: Record<string, unknown>): Promise<number> {
    return db.collection(collection).countDocuments(filter, { maxTimeMS: QUERY_TIMEOUT_MS });
}
async function customerReview(db: Db, bundle: BillingCatalogBundle | null): Promise<CatalogReview['customers']> {
    const byTier: CatalogReview['customers']['byTier'] = { recurring: 0, lifetime: 0 };
    try {
        await Promise.all((['recurring', 'lifetime'] as const).map(async tier => {
            const pair = familyPair(bundle, tier); if (!pair) return;
            const differences = (['storage', 'transcription'] as const).flatMap(kind => [
                { [`billingUsageTariffs.${kind}.priceId`]: { $ne: pair[kind].priceId } },
                { [`billingUsageTariffs.${kind}.unitPriceAtoms`]: { $ne: pair[kind].unitPriceAtoms } },
                { [`billingUsageTariffs.${kind}.minimumQuantity`]: { $ne: pair[kind].minimumQuantity } },
                { [`billingUsageTariffs.${kind}.eventName`]: { $ne: pair[kind].eventName } },
            ]);
            byTier[tier] = await count(db, Collections.USERS, { ...paidAccounts, 'billingEntitlement.source': tier === 'lifetime' ? 'lifetime' : 'subscription', $or: differences });
        }));
        const [fundingTransfers, billingReviews] = await Promise.all([
            count(db, Collections.USERS, { ...paidAccounts, billingGrantTransfer: { $exists: true } }),
            count(db, Collections.USERS, { ...paidAccounts, billingReview: { $exists: true } }),
        ]);
        return { affected: (byTier.recurring || 0) + (byTier.lifetime || 0), byTier, fundingTransfers, billingReviews };
    } catch (error) { return { affected: null, byTier: { recurring: null, lifetime: null }, fundingTransfers: null, billingReviews: null, error: errorMessage(error) }; }
}
async function rolloutReview(db: Db, bundleId: string | undefined): Promise<CatalogReview['rollouts']> {
    try {
        const jobs = db.collection<UsagePriceRollout>(USAGE_PRICE_ROLLOUTS);
        const [counts, total, targetTotal, noticed, emailSent, noticeMissing, blocked, pending, earliest, latest] = await Promise.all([
            Promise.all(states.map(async state => [state, await count(db, USAGE_PRICE_ROLLOUTS, { state })] as const)),
            count(db, USAGE_PRICE_ROLLOUTS, {}), bundleId ? count(db, USAGE_PRICE_ROLLOUTS, { targetBundleId: bundleId }) : Promise.resolve(0),
            count(db, USAGE_PRICE_ROLLOUTS, { ...pendingFilter, noticedAt: { $exists: true } }),
            count(db, USAGE_PRICE_ROLLOUTS, { ...pendingFilter, emailSentAt: { $exists: true } }),
            count(db, USAGE_PRICE_ROLLOUTS, { ...pendingFilter, noticedAt: { $exists: false } }),
            count(db, USAGE_PRICE_ROLLOUTS, { ...pendingFilter, $or: [{ state: 'needs_review' }, { lastError: { $exists: true, $ne: '' } },
                { effectiveAt: { $lte: new Date() }, state: { $in: ['scheduled', 'preparing', 'prepared', 'applying'] } }] }),
            jobs.find(pendingFilter, { maxTimeMS: QUERY_TIMEOUT_MS }).sort({ effectiveAt: 1, createdAt: 1 }).limit(MAX_PENDING + 1).toArray(),
            jobs.find({ ...pendingFilter, effectiveAt: { $exists: true } }, { maxTimeMS: QUERY_TIMEOUT_MS }).sort({ effectiveAt: 1 }).limit(1).toArray(),
            jobs.find({ ...pendingFilter, effectiveAt: { $exists: true } }, { maxTimeMS: QUERY_TIMEOUT_MS }).sort({ effectiveAt: -1 }).limit(1).toArray(),
        ]);
        return { total, targetTotal, byState: Object.fromEntries(counts), noticed, emailSent, noticeMissing, blocked,
            earliestActivation: iso(earliest[0]?.effectiveAt), latestActivation: iso(latest[0]?.effectiveAt), truncated: pending.length > MAX_PENDING,
            pending: pending.slice(0, MAX_PENDING).map(row => ({ id: row._id, state: row.state, targetBundleId: row.targetBundleId,
                effectiveAt: iso(row.effectiveAt), noticedAt: iso(row.noticedAt), ...(row.lastError ? { lastError: row.lastError.slice(0, 500) } : {}) })) };
    } catch (error) { return { total: null, targetTotal: null, byState: {}, noticed: null, emailSent: null, noticeMissing: null, blocked: null,
        pending: [], truncated: false, error: errorMessage(error) }; }
}

/** The caller must authenticate an administrator. This reads evidence; it cannot publish or send notices. */
export async function buildCatalogReview(db: Db, bundleId?: string): Promise<CatalogReview> {
    const bundles = db.collection<BillingCatalogBundle>(CATALOG_BUNDLES);
    const [state, targets, discovery] = await Promise.all([
        db.collection<CatalogState>(CATALOG_STATE).findOne({ _id: 'active' }, { maxTimeMS: QUERY_TIMEOUT_MS }),
        bundles.find(bundleId ? { _id: bundleId } : { state: 'draft' }, { maxTimeMS: QUERY_TIMEOUT_MS }).sort({ createdAt: -1 }).limit(1).toArray(),
        getCatalogDiscoveryStatus(db),
    ]);
    const active = state?.bundleId ? await bundles.findOne({ _id: state.bundleId, state: 'published' }, { maxTimeMS: QUERY_TIMEOUT_MS }) : null;
    const bundle = targets[0] || (!bundleId ? active : null), warnings: string[] = [];
    if (!bundle) warnings.push(bundleId ? 'The selected catalog could not be found.' : 'Import a complete Stripe catalog draft to review its prices.');
    if (state?.publicationOutbox) warnings.push('The previous publication is still scheduling customer price-change notices.');
    if (state?.pausedPlanKeys?.length) warnings.push(`Paused offers: ${state.pausedPlanKeys.join(', ')}.`);
    const validation = blockingValidation(bundle);
    const [customers, rollouts] = await Promise.all([customerReview(db, bundle), rolloutReview(db, bundle?._id)]);
    const changedAt = iso(discovery?.changedAt), checkedAt = iso(discovery?.checkedAt);
    const stale = !checkedAt || discovery?.revision !== discovery?.refreshedRevision || Boolean(discovery?.lastError)
        || Date.now() - Date.parse(checkedAt) > 15 * 60_000;
    if (stale) warnings.push('Stripe discovery is stale or has changed. Refresh and import explicitly before reviewing replacement prices.');
    return { targetBundleId: bundle?._id, activeBundleId: active?._id, state: bundle?.state, stripeAccountId: bundle?.stripeAccountId, livemode: bundle?.livemode,
        validation, rates: rateChanges(bundle, active), plans: (bundle?.plans || []).slice(0, MAX_PLANS).map(entry => {
            const previous = active?.plans.find(old => old.plan.key === entry.plan.key)?.plan, plan = entry.plan;
            return { key: plan.key, name: plan.name, interval: plan.interval, proposedUsd: baseUsd(plan.price), ...(previous ? { previousUsd: baseUsd(previous.price),
                previousStorageBytes: previous.limits.storage, previousWeightedSeconds: previous.limits.transcription } : {}),
            changed: !previous || previous.stripePriceId !== plan.stripePriceId || previous.price !== plan.price || previous.interval !== plan.interval
                || previous.limits.storage !== plan.limits.storage || previous.limits.transcription !== plan.limits.transcription,
            storageBytes: plan.limits.storage, weightedSeconds: plan.limits.transcription };
        }), customers, rollouts,
        discovery: { revision: discovery?.revision || 0, refreshedRevision: discovery?.refreshedRevision, checkedAt, changedAt, stale,
            ...(discovery?.lastError ? { lastError: discovery.lastError.slice(0, 500) } : {}), priceCount: discovery?.prices?.length || 0 }, warnings };
}

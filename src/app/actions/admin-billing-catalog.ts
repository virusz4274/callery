'use server';

import { revalidatePath } from 'next/cache';
import { requireCurrentAdmin } from '@/lib/admin-auth';
import { getMongoDb } from '@/lib/mongodb';
import { getStripe } from '@/lib/stripe';
import { billingEnabled } from '@/lib/config';
import { logAdminAction } from './audit-log';
import { CATALOG_BUNDLES, CATALOG_STATE, importStripeCatalogDraft, publishCatalogDraft, refreshCatalogAcceptanceEvidence, pausePublishedOffer,
    type BillingCatalogBundle, type CatalogState, type StripeCatalogImport } from '@/lib/stripe/catalog-bundle';
import type { BillingLaunchEvidence } from '@/lib/stripe/launch-gate';
import { buildCatalogReview, type CatalogReview } from '@/lib/stripe/catalog-review';
import { ensureBillingIndexes } from '@/lib/stripe/database';

function summary(bundle: BillingCatalogBundle) {
    return { id: bundle._id, state: bundle.state, createdAt: bundle.createdAt.toISOString(), stripeAccountId: bundle.stripeAccountId,
        livemode: bundle.livemode,
        acceptanceVerifiedAt: bundle.acceptanceEvidence?.verifiedAt,
        plans: bundle.plans.map(entry => ({ key: entry.plan.key, name: entry.plan.name, price: entry.plan.price, interval: entry.plan.interval,
            storageBytes: entry.plan.limits.storage, weightedMinutes: entry.plan.limits.transcription / 60, basePriceId: entry.plan.stripePriceId,
            storagePriceId: entry.usageTariffs.storage.priceId, storageUnitCents: entry.usageTariffs.storage.unitAmountDecimal,
            transcriptionPriceId: entry.usageTariffs.transcription.priceId, blockUnitCents: entry.usageTariffs.transcription.unitAmountDecimal })) };
}
export async function getBillingCatalogReview() {
    await requireCurrentAdmin();
    if (!billingEnabled()) return { enabled: false, activeId: undefined, pausedPlanKeys: [] as string[], drafts: [] as ReturnType<typeof summary>[], validation: null as CatalogReview | null };
    const db = await getMongoDb(), state = await db.collection<CatalogState>(CATALOG_STATE).findOne({ _id: 'active' });
    const drafts = await db.collection<BillingCatalogBundle>(CATALOG_BUNDLES).find({}).sort({ createdAt: -1 }).limit(10).toArray();
    return { enabled: true, activeId: state?.bundleId, pausedPlanKeys: state?.pausedPlanKeys || [], drafts: drafts.map(summary),
        validation: await buildCatalogReview(db, drafts[0]?._id) };
}
export async function getBillingCatalogValidation(id: string) {
    await requireCurrentAdmin();
    if (!billingEnabled() || typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw new Error('Choose an imported managed catalog to review.');
    return buildCatalogReview(await getMongoDb(), id);
}
export async function importBillingCatalog(json: string) {
    const admin = await requireCurrentAdmin();
    if (!billingEnabled()) throw new Error('Managed billing is disabled in this deployment.');
    if (typeof json !== 'string' || json.length > 100_000) throw new Error('Enter a bounded Stripe catalog import.');
    let input: StripeCatalogImport;
    try { input = JSON.parse(json) as StripeCatalogImport; } catch { throw new Error('The catalog import must be valid JSON.'); }
    const db = await getMongoDb();
    await ensureBillingIndexes(db);
    const bundle = await importStripeCatalogDraft(input, db, getStripe(), admin._id.toString());
    await logAdminAction(admin._id.toString(), 'PLAN_CREATE', { purpose: 'stripe_catalog_import', bundleId: bundle._id }, bundle._id, 'PLAN');
    revalidatePath('/admin/plans');
    return summary(bundle);
}
export async function publishBillingCatalog(id: string, reviewed: boolean, evidenceJson?: string) {
    const admin = await requireCurrentAdmin();
    if (!billingEnabled() || reviewed !== true || typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw new Error('Review the imported amounts, allowances and usage rates before publishing.');
    let evidence: BillingLaunchEvidence | undefined;
    if (evidenceJson?.trim()) {
        if (evidenceJson.length > 100_000) throw new Error('Acceptance evidence is too large.');
        try { evidence = JSON.parse(evidenceJson) as BillingLaunchEvidence; } catch { throw new Error('Acceptance evidence must be valid JSON.'); }
    }
    const db = await getMongoDb(), bundle = await publishCatalogDraft(id, db, getStripe(), admin._id.toString(), evidence);
    await logAdminAction(admin._id.toString(), 'PLAN_UPDATE', { purpose: 'stripe_catalog_publish', bundleId: id }, id, 'PLAN');
    revalidatePath('/admin/plans'); revalidatePath('/');
    return summary(bundle);
}
export async function setBillingOfferPaused(key: string, paused: boolean) {
    const admin = await requireCurrentAdmin();
    if (!billingEnabled() || !/^[a-z][a-z0-9-]{0,63}$/.test(key) || typeof paused !== 'boolean') throw new Error('Choose a valid managed offer.');
    const db = await getMongoDb(); await pausePublishedOffer(key, paused, db);
    await logAdminAction(admin._id.toString(), 'PLAN_UPDATE', { purpose: 'stripe_offer_pause', key, paused }, key, 'PLAN');
    revalidatePath('/admin/plans'); revalidatePath('/');
}
export async function refreshBillingCatalogAcceptance(id: string, reviewed: boolean, evidenceJson: string) {
    const admin = await requireCurrentAdmin();
    if (!billingEnabled() || reviewed !== true || !/^[a-f0-9]{64}$/.test(id) || typeof evidenceJson !== 'string' || evidenceJson.length > 100_000) throw new Error('Review the published catalog and provide its current acceptance evidence.');
    let evidence: BillingLaunchEvidence;
    try { evidence = JSON.parse(evidenceJson) as BillingLaunchEvidence; } catch { throw new Error('Acceptance evidence must be valid JSON.'); }
    const db = await getMongoDb(), bundle = await refreshCatalogAcceptanceEvidence(id, evidence, db, getStripe(), admin._id.toString());
    await logAdminAction(admin._id.toString(), 'PLAN_UPDATE', { purpose: 'stripe_catalog_acceptance_refresh', bundleId: id }, id, 'PLAN');
    revalidatePath('/admin/plans');
    return summary(bundle);
}

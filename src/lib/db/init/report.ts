import { isDeepStrictEqual } from 'node:util';
import { ObjectId, type Db } from 'mongodb';
import type { Plan, SystemSettings } from '../types';
import { INSTALLATION_PLANS } from '@/lib/installation-defaults';
import { PLAN_KEYS } from '@/lib/plans';
import type { BillingCatalogBundle } from '@/lib/stripe/catalog-bundle';
import type { PublishedCatalog } from '@/lib/stripe/catalog-publication';
import { assertUsageTariff } from '@/lib/stripe/usage-tariff';
import { assertValidDefaultPlan } from '../default-plan';
import { inspectInitializationIndexes } from './indexes';
import type { SeedCollections } from './seed';

export interface InitializationReport {
    plans: { create: string[]; preserve: string[]; differences: { key: string; fields: string[] }[] };
    settings: 'create' | 'preserve' | 'conflict';
    indexes: Awaited<ReturnType<typeof inspectInitializationIndexes>>;
    catalog: 'disabled' | 'not-configured' | 'published' | 'invalid';
    warnings: string[];
    errors: string[];
}

async function inspectPublishedCatalog(db: Db, bundleId: string): Promise<void> {
    const bundle = await db.collection<BillingCatalogBundle>('billing_catalog_bundles').findOne({ _id: bundleId, state: 'published' });
    if (!bundle || bundle.schemaVersion !== 1 || !(bundle.publishedAt instanceof Date) || !Number.isFinite(bundle.publishedAt.getTime())
        || !Array.isArray(bundle.plans) || new Set(bundle.plans.map(entry => entry.plan?.key)).size !== bundle.plans.length
        || [PLAN_KEYS.STANDARD, PLAN_KEYS.PRO, PLAN_KEYS.LIFETIME].some(key => !bundle.plans.some(entry => entry.plan?.key === key))) {
        throw new Error('The active billing catalog pointer does not reference a complete published bundle.');
    }
    for (const entry of bundle.plans) {
        const { plan, usageTariffs } = entry;
        if (!plan || !usageTariffs?.storage || !usageTariffs.transcription || !entry.catalogVersion) throw new Error('The published billing catalog has an incomplete plan snapshot.');
        assertUsageTariff(usageTariffs.storage); assertUsageTariff(usageTariffs.transcription);
        if (usageTariffs.storage.kind !== 'storage' || usageTariffs.transcription.kind !== 'transcription'
            || plan.billingCatalogVersion !== entry.catalogVersion || plan.billingCatalogBundleId !== bundleId
            || !plan.stripePriceId?.startsWith('price_') || plan.stripeStoragePriceId !== usageTariffs.storage.priceId
            || plan.stripeTranscriptionPriceId !== usageTariffs.transcription.priceId || !isDeepStrictEqual(plan.usageTariffs, usageTariffs)
            || [usageTariffs.storage, usageTariffs.transcription].some(tariff => tariff.catalogVersion !== bundleId
                || tariff.usageTier !== (plan.interval === 'lifetime' ? 'lifetime' : 'recurring'))) {
            throw new Error('The published billing catalog has inconsistent price or usage tariff mappings.');
        }
        const archived = await db.collection<PublishedCatalog>('billing_catalog_versions').findOne({ _id: entry.catalogVersion, bundleId });
        if (!archived || !(archived.publishedAt instanceof Date) || !Number.isFinite(archived.publishedAt.getTime())
            || archived.costVersion !== bundle.costVersion || archived.costFingerprint !== bundle.costFingerprint
            || !isDeepStrictEqual(archived.plan, plan) || !isDeepStrictEqual(archived.usageTariffs, usageTariffs)) {
            throw new Error('The published billing catalog archive is missing or inconsistent. Review it before initialization.');
        }
    }
}

/** Only local reads: no Stripe requests, index writes, collections, or evidence. */
export async function inspectInitialization(db: Db, collections: Parameters<typeof inspectInitializationIndexes>[1] & SeedCollections, managed: boolean): Promise<InitializationReport> {
    const report: InitializationReport = { plans: { create: [], preserve: [], differences: [] }, settings: 'create',
        indexes: await inspectInitializationIndexes(db, collections), catalog: managed ? 'not-configured' : 'disabled', warnings: [], errors: [] };
    const rows = await db.collection<Plan>(collections.PLANS).find({}).toArray();
    const duplicateKeys = [...new Set(rows.filter((row, index) => rows.findIndex(other => other.key === row.key) !== index).map(row => row.key))];
    if (duplicateKeys.length) report.errors.push(`Duplicate plan keys require explicit repair: ${duplicateKeys.join(', ')}.`);
    const names = new Map<string, string>();
    for (const row of rows) {
        if (names.has(row.name) && names.get(row.name) !== row.key) report.errors.push('Duplicate plan names conflict with the required unique index.');
        names.set(row.name, row.key);
    }
    for (const expected of INSTALLATION_PLANS) {
        const current = rows.find(row => row.key === expected.key);
        if (!current) {
            report.plans.create.push(expected.key);
            if (rows.some(row => row.name === expected.name)) report.errors.push(`The missing ${expected.key} template name belongs to another plan. Resolve that conflict explicitly.`);
            continue;
        }
        report.plans.preserve.push(expected.key);
        const fields = Object.keys(expected).filter(key => !isDeepStrictEqual(current[key as keyof Plan], expected[key as keyof typeof expected]));
        if (fields.length) report.plans.differences.push({ key: expected.key, fields });
    }
    const settings = await db.collection<SystemSettings>(collections.SYSTEM_SETTINGS).find({}).limit(2).toArray();
    if (settings.length > 1) {
        report.settings = 'conflict'; report.errors.push('Multiple system settings documents exist; initialization will not select or delete one.');
    } else if (settings.length === 1) {
        report.settings = 'preserve';
        if (!(settings[0].defaultPlanId instanceof ObjectId)) report.errors.push('System settings require a valid ObjectId onboarding default.');
        else {
            const defaultPlan = rows.find(row => row._id instanceof ObjectId && row._id.equals(settings[0].defaultPlanId)) || null;
            try { assertValidDefaultPlan(defaultPlan, managed); }
            catch (error) { report.errors.push(error instanceof Error ? error.message : 'Invalid onboarding default.'); }
        }
    } else {
        const trial = rows.find(row => row.key === PLAN_KEYS.FREE_TRIAL);
        if (trial) {
            try { assertValidDefaultPlan(trial, managed); }
            catch (error) { report.errors.push(error instanceof Error ? error.message : 'Invalid onboarding default.'); }
        }
    }
    for (const conflict of report.indexes.conflicts) report.errors.push(`${conflict.collection}.${conflict.name}: ${conflict.message}`);
    if (report.plans.differences.length) report.warnings.push('Existing plans differ from installation templates and will be preserved. Published Stripe terms are checked separately.');
    if (managed) {
        const pointer = await db.collection<{ _id: string; bundleId?: string }>('billing_catalog_state').findOne({ _id: 'active' });
        if (pointer?.bundleId) {
            try { await inspectPublishedCatalog(db, pointer.bundleId); report.catalog = 'published'; }
            catch (error) {
                report.catalog = 'invalid'; report.errors.push(error instanceof Error ? error.message : 'The published billing catalog requires review.');
            }
        } else report.warnings.push('Managed billing is not configured. Import, review, and publish Stripe prices before purchases are available.');
        const missing = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_METER_WEBHOOK_SECRET', 'STRIPE_PORTAL_CONFIGURATION_ID']
            .filter(key => !process.env[key]);
        if (missing.length) report.warnings.push(`Managed setup still needs: ${missing.join(', ')}. No credential values are displayed.`);
        report.warnings.push('This local initialization report does not certify Stripe payments, metering, processing, or live-launch acceptance.');
    }
    return report;
}

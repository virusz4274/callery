import { testProcessingCostEvidence } from './processing-test-support';
import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { FakeBillingStripe, MemoryBillingDatabase, clone } from './test-support';
import { importStripeCatalogDraft, publishCatalogDraft, refreshCatalogAcceptanceEvidence, getActiveCatalogBundle, pausePublishedOffer, type StripeCatalogImport } from './catalog-bundle';
import { assertArchivedUsageTariff, assertPublishedPlan } from './catalog-publication';
import { BILLING_CATALOG } from './catalog';
import { REQUIRED_BILLING_CHECKS, type BillingLaunchEvidence } from './launch-gate';

const policy = { version: 'catalog-test', reviewedAt: '2020-01-01', expiresAt: '2099-01-01', paymentFeeBasisPoints: 0, paymentFixedMicros: 0,
    stripeBillingFeeBasisPoints: 70, stripeBillingFixedMicros: 0, minimumTopupMicros: 5_000_000, recoveryReserveMicros: 1, lifetimeHostingReserveMicros: 1,
    infrastructureMicrosPerAudioMinute: 0, infrastructureMicrosPerGiB: 0, aiBundleMicrosPerAudioMinute: 0, aiBundleFixedMicros: 0,
    storageCostMicrosPerGiBMonth: 100, storageOperationsMicrosPerGiBMonth: 0,
    providers: { soniox: { costMicrosPerAudioMinute: 100, fixedMicros: 0 }, gemini: { costMicrosPerAudioMinute: 100, fixedMicros: 0 }, elevenlabs: { costMicrosPerAudioMinute: 100, fixedMicros: 0 } },
    ...testProcessingCostEvidence(), lifetimeUsage: { audioOverheadMicrosPerMinute: 0, recordingOverheadMicros: 0, storageOverheadMicrosPerGiBMonth: 0 },
    exports: { fixedMicros: 0, perGiBMicros: 0, maximumSourceBytes: 1_000_000, recoveryReserveMicros: 1 } };
const input: StripeCatalogImport = { plans: [
    { key: 'standard', stripePriceId: 'price_base', limits: { storage: 2 * 1024 ** 3, transcription: 3600 } },
    { key: 'pro', stripePriceId: 'price_pro', limits: { storage: 5 * 1024 ** 3, transcription: 7200 } },
    { key: 'lifetime', stripePriceId: 'price_lifetime', limits: { storage: 0, transcription: 0 } },
], usagePriceIds: { recurring: { storage: 'price_storage', transcription: 'price_transcription' },
    lifetime: { storage: 'price_lifetime_storage', transcription: 'price_lifetime_transcription' } } };
function fixture(t: test.TestContext) {
    const prior = process.env.MANAGED_COST_POLICY_JSON;
    process.env.MANAGED_COST_POLICY_JSON = JSON.stringify(policy);
    t.after(() => { if (prior === undefined) delete process.env.MANAGED_COST_POLICY_JSON; else process.env.MANAGED_COST_POLICY_JSON = prior; });
    const memory = new MemoryBillingDatabase(), stripe = new FakeBillingStripe();
    stripe.priceValues.get('price_base')!.unit_amount = 1000;
    stripe.priceValues.get('price_lifetime')!.unit_amount = 25000;
    stripe.priceValues.set('price_pro', { ...clone(stripe.priceValues.get('price_base')!), id: 'price_pro', unit_amount: 2000 });
    for (const value of stripe.priceValues.values()) Object.assign(value, { livemode: false, billing_scheme: 'per_unit', product: `prod_${value.id}` });
    Object.assign(stripe.prices, { retrieve: async (id: string, params?: { expand?: string[] }) => {
        const value = clone(stripe.priceValues.get(id)!);
        if (params?.expand?.includes('product')) value.product = { id: `prod_${id}`, active: true, name: id, description: 'Imported from Stripe', metadata: {} } as Stripe.Product;
        return value;
    } });
    return { memory, db: memory.asDb(), stripe, provider: stripe.asStripe() };
}

test('Stripe-authoritative quantity prices import as drafts and publish one complete atomic bundle', async t => {
    const { db, stripe, provider } = fixture(t);
    stripe.priceValues.get('price_base')!.unit_amount = 1300;
    stripe.priceValues.get('price_transcription')!.unit_amount_decimal = '0.300000000001' as unknown as Stripe.Price['unit_amount_decimal'];
    const draft = await importStripeCatalogDraft(input, db, provider);
    assert.equal(draft.state, 'draft'); assert.equal(await getActiveCatalogBundle(db), null);
    assert.equal(draft.plans[0].plan.price, 13);
    assert.equal(draft.plans[0].usageTariffs.transcription.unitAmountDecimal, '0.300000000001');
    assert.equal(draft.plans[0].usageTariffs.transcription.quantityUnit, 'weighted_15s_block');
    assert.equal(draft.plans[2].usageTariffs.transcription.quantityUnit, 'weighted_15s_block');
    await publishCatalogDraft(draft._id, db, provider);
    assert.equal((await getActiveCatalogBundle(db))?._id, draft._id);
    assert.equal((await assertPublishedPlan(draft.plans[0].plan, db)).usageTariffs.transcription.unitPriceAtoms, '300000000001');
    await assertArchivedUsageTariff(draft.plans[2].usageTariffs.storage, db);
});

test('archiving a Stripe price preserves existing immutable tariff proof while new sales pause independently', async t => {
    const { db, stripe, provider } = fixture(t), draft = await importStripeCatalogDraft(input, db, provider);
    await publishCatalogDraft(draft._id, db, provider);
    stripe.priceValues.get('price_storage')!.active = false;
    await assertArchivedUsageTariff(draft.plans[0].usageTariffs.storage, db);
    await pausePublishedOffer('standard', true, db);
    assert.equal((await getActiveCatalogBundle(db))?.plans.some(row => row.plan.key === 'standard'), false);
    await assert.rejects(assertPublishedPlan(draft.plans[0].plan, db), /publish this offer/);
    await assertArchivedUsageTariff(draft.plans[0].usageTariffs.storage, db);
});

test('missing or malformed cost evidence never blocks structurally valid Stripe prices', async t => {
    const { db, stripe, provider } = fixture(t);
    stripe.priceValues.get('price_lifetime_transcription')!.unit_amount_decimal = '0.000000000001' as unknown as Stripe.Price['unit_amount_decimal'];
    const lowRate = await importStripeCatalogDraft(input, db, provider);
    await publishCatalogDraft(lowRate._id, db, provider);
    assert.equal((await getActiveCatalogBundle(db))?._id, lowRate._id);
    stripe.priceValues.get('price_lifetime_transcription')!.unit_amount_decimal = '0.25' as unknown as Stripe.Price['unit_amount_decimal'];
    for (const value of [undefined, '{invalid', JSON.stringify({ expiresAt: '2020-01-01' })]) {
        if (value === undefined) delete process.env.MANAGED_COST_POLICY_JSON;
        else process.env.MANAGED_COST_POLICY_JSON = value;
        const independent = await importStripeCatalogDraft(input, db, provider);
        assert.equal(independent.costVersion, undefined);
        assert.equal(independent.costFingerprint, undefined);
    }
    assert.equal((await getActiveCatalogBundle(db))?._id, lowRate._id);
});

test('a base price below bounded allowance costs remains publishable after explicit review', async t => {
    const { db, stripe, provider } = fixture(t);
    process.env.MANAGED_COST_POLICY_JSON = JSON.stringify({ ...policy, recoveryReserveMicros: 20_000 });
    stripe.priceValues.get('price_base')!.unit_amount = 1;
    const draft = await importStripeCatalogDraft(input, db, provider);
    assert.equal(draft.plans[0].plan.price, 0.01);
    await publishCatalogDraft(draft._id, db, provider);
    assert.equal((await assertPublishedPlan(draft.plans[0].plan, db)).plan.price, 0.01);
});

test('renewed acceptance proof is audited without republishing financial terms or scheduling another rollout', async t => {
    const { db, memory, provider } = fixture(t), draft = await importStripeCatalogDraft(input, db, provider);
    await publishCatalogDraft(draft._id, db, provider);
    const pointer = clone(memory.collection('billing_catalog_state').values[0]);
    const originalPlans = clone(memory.collection('billing_catalog_bundles').values[0].plans);
    const now = Date.now(), evidence: BillingLaunchEvidence = { schemaVersion: 2, livemode: false, tariffVersion: BILLING_CATALOG.version, costVersion: policy.version,
        stripeAccountId: draft.stripeAccountId, catalogVersion: draft._id, costFingerprint: draft.costFingerprint,
        verifiedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 86400_000).toISOString(),
        priceIds: draft.stripeObjects.prices.map(row => String(row.id)), checks: Object.fromEntries(REQUIRED_BILLING_CHECKS.map(key => [key, true])) as BillingLaunchEvidence['checks'] };
    await refreshCatalogAcceptanceEvidence(draft._id, evidence, db, provider, 'admin');
    await refreshCatalogAcceptanceEvidence(draft._id, evidence, db, provider, 'admin');
    assert.equal(memory.collection('billing_catalog_acceptance').values.length, 1);
    assert.deepEqual(memory.collection('billing_catalog_state').values[0], pointer);
    assert.deepEqual(memory.collection('billing_catalog_bundles').values[0].plans, originalPlans);
    await assert.rejects(refreshCatalogAcceptanceEvidence(draft._id, { ...evidence, catalogVersion: 'other' }, db, provider), /does not cover/);
    await assert.rejects(refreshCatalogAcceptanceEvidence(draft._id, { ...evidence, verifiedAt: new Date(now - 2000).toISOString() }, db, provider), /newer verified/);
});

test('changed cost configuration cannot invalidate a draft and concurrent publication has one winner', async t => {
    const { db, memory, stripe, provider } = fixture(t), first = await importStripeCatalogDraft(input, db, provider);
    process.env.MANAGED_COST_POLICY_JSON = JSON.stringify({ ...policy, version: 'changed-costs' });
    stripe.priceValues.get('price_base')!.unit_amount = 1400;
    const second = await importStripeCatalogDraft(input, db, provider);
    const outcomes = await Promise.allSettled([publishCatalogDraft(first._id, db, provider), publishCatalogDraft(second._id, db, provider)]);
    assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 1);
    assert.equal(memory.collection('billing_catalog_state').values.length, 1);
});

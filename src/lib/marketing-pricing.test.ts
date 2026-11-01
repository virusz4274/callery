import test from 'node:test';
import assert from 'node:assert/strict';
import type { PublicPlan } from '@/app/actions/plans';
import {
    formatMarketingPrice,
    formatMarketingStorage,
    projectMarketingPricing,
} from './marketing-pricing';
import { buildOfferSchemas, serializeJsonLd, siteSeoConfig } from './seo';

function paidPlan(key = 'standard', overrides: Partial<PublicPlan> = {}): PublicPlan {
    return {
        id: `internal-db-${key}`, key, name: `Sandbox ${key}`, description: 'Internal setup and acceptance fixture',
        price: 12.5, currency: 'usd', interval: key === 'lifetime' ? 'lifetime' : 'monthly',
        features: ['Internal use', 'Pro-only semantic search', 'Unlimited storage'], stripePriceId: `price_test_${key}`,
        catalogVersion: `catalog-${key}-v1`, isPurchasable: true, storageBytes: key === 'lifetime' ? 0 : 2 * 1024 ** 3,
        weightedMinutes: key === 'lifetime' ? 0 : 60,
        usagePricing: {
            ready: true, tier: key === 'lifetime' ? 'lifetime' : 'recurring', currency: 'usd', minimumMarginBps: 5000,
            minimumRecordingUsd: '0', storageUsdPerGiB: '0.02', catalogVersion: 'internal-rate-version',
            transcription: { quantityUnit: 'weighted_15s_block', unitAmountDecimal: 'internal-unit', usdPerUnit: '0.25' },
            providers: [
                { id: 'soniox', name: 'Sandbox speech model', multiplier: 1, usdPerMinute: '0.25' },
                { id: 'gemini', name: 'Internal premium model', multiplier: 3, usdPerMinute: '0.75' },
            ],
        },
        ...overrides,
    };
}

const trial = { key: 'free-trial', isActive: true, limits: { storage: 100 * 1024 ** 2, transcription: 10 * 60 } };

test('marketing uses stable public plan names and curated copy instead of imported merchandising', () => {
    const pricing = projectMarketingPricing([
        paidPlan('lifetime'), paidPlan('internal'), paidPlan('pro'), paidPlan('custom'), paidPlan(), paidPlan('sandbox'),
    ], trial);
    assert.deepEqual(pricing.plans.map(plan => plan.key), ['standard', 'pro', 'lifetime']);
    assert.deepEqual(pricing.plans.map(plan => plan.name), ['Standard', 'Pro', 'Lifetime']);
    assert.equal(pricing.plans[0].price, 12.5);
    assert.equal(pricing.plans[0].currency, 'USD');
    assert.equal(pricing.plans[0].storageBytes, 2 * 1024 ** 3);
    assert.equal(pricing.trial?.storageBytes, 100 * 1024 ** 2);
    assert.equal(pricing.trial?.weightedMinutes, 10);
    assert.equal(pricing.trial?.durationDays, 30);
    const output = JSON.stringify(pricing);
    for (const internal of ['Sandbox', 'Internal', 'Pro-only', 'Unlimited', 'internal-db', 'minimumMarginBps', 'quantityUnit', 'internal-rate-version']) {
        assert.equal(output.includes(internal), false, internal);
    }
});

test('unsupported, zero-price and malformed offers never become fake paid plans', () => {
    for (const overrides of [
        { price: 0 }, { price: -1 }, { price: Number.NaN }, { price: Number.POSITIVE_INFINITY },
        { price: undefined }, { currency: '' }, { currency: 'sandbox-dollars' }, { interval: 'lifetime' },
    ] as Partial<PublicPlan>[]) {
        assert.deepEqual(projectMarketingPricing([paidPlan('standard', overrides)], null).plans, []);
    }
    assert.deepEqual(projectMarketingPricing([paidPlan('lifetime', { interval: 'monthly' })], null).plans, []);
    assert.deepEqual(projectMarketingPricing([], null), { trial: null, plans: [] });
});

test('zero allowances stay zero and missing or invalid allowances stay unknown', () => {
    const zero = projectMarketingPricing([paidPlan('standard', { storageBytes: 0, weightedMinutes: 0 })], {
        ...trial, limits: { storage: 0, transcription: 0 },
    });
    assert.equal(zero.plans[0].storageBytes, 0);
    assert.equal(zero.plans[0].weightedMinutes, 0);
    assert.equal(zero.trial?.storageBytes, 0);
    assert.equal(zero.trial?.weightedMinutes, 0);
    const missing = projectMarketingPricing([paidPlan('standard', { storageBytes: undefined, weightedMinutes: Number.NaN })], null);
    assert.equal(missing.plans[0].storageBytes, null);
    assert.equal(missing.plans[0].weightedMinutes, null);
    const invalid = projectMarketingPricing([paidPlan('standard', { storageBytes: -10, weightedMinutes: -10 })], null);
    assert.equal(invalid.plans[0].storageBytes, null);
    assert.equal(invalid.plans[0].weightedMinutes, null);
});

test('missing, inactive or invalid onboarding data never invents a free trial', () => {
    for (const source of [null, { ...trial, key: 'internal' }, { ...trial, isActive: false },
        { ...trial, limits: { storage: -1, transcription: 600 } },
        { ...trial, limits: { storage: 100, transcription: Number.NaN } }]) {
        assert.equal(projectMarketingPricing([], source).trial, null);
    }
});

test('usage projection retains exact public rates and weights while discarding provider merchandising and internals', () => {
    const source = paidPlan();
    source.usagePricing!.providers.push({ id: 'sandbox-model', name: 'Sandbox', multiplier: 99, usdPerMinute: '123' });
    const pricing = projectMarketingPricing([source], null);
    assert.deepEqual(pricing.plans[0].usage, {
        providers: [
            { id: 'soniox', name: 'Soniox', multiplier: 1, usdPerMinute: '0.25' },
            { id: 'gemini', name: 'Gemini', multiplier: 3, usdPerMinute: '0.75' },
        ],
        storageUsdPerGiB: '0.02', minimumRecordingUsd: '0',
    });
});

test('unverified, mismatched and malformed usage rates are omitted without invented prices', () => {
    const source = paidPlan();
    for (const usagePricing of [undefined, { ...source.usagePricing!, ready: false },
        { ...source.usagePricing!, tier: 'lifetime' as const },
        { ...source.usagePricing!, storageUsdPerGiB: 'ask an administrator' },
        { ...source.usagePricing!, minimumRecordingUsd: '-1' },
        { ...source.usagePricing!, providers: [] }]) {
        const pricing = projectMarketingPricing([paidPlan('standard', { usagePricing })], null);
        assert.equal(pricing.plans[0].usage, null);
    }
});

test('checkout identifiers are preserved only for purchasable offers with complete published checkout data', () => {
    const available = projectMarketingPricing([paidPlan()], null).plans[0];
    assert.deepEqual(available.checkout, { stripePriceId: 'price_test_standard', catalogVersion: 'catalog-standard-v1' });
    for (const overrides of [{ isPurchasable: false }, { isPurchasable: undefined }, { catalogVersion: undefined }, { stripePriceId: '' }]) {
        const unavailable = projectMarketingPricing([paidPlan('standard', overrides)], null).plans[0];
        assert.equal(unavailable.checkout, null);
        assert.equal(unavailable.price, available.price);
    }
});

test('structured offers use the same canonical pricing, including absent trials and unavailable offers', () => {
    const pricing = projectMarketingPricing([paidPlan(), paidPlan('pro', { isPurchasable: false }), paidPlan('internal')], trial);
    const offers = buildOfferSchemas(siteSeoConfig, pricing);
    assert.deepEqual(offers.map(offer => offer.name), ['Free trial', 'Standard', 'Pro']);
    assert.deepEqual(offers.map(offer => offer.price), ['0', '12.5', '12.5']);
    assert.deepEqual(offers.map(offer => offer.availability), ['https://schema.org/InStock', 'https://schema.org/InStock', 'https://schema.org/OutOfStock']);
    assert.equal(serializeJsonLd(offers).includes('Sandbox'), false);
    assert.equal(serializeJsonLd(offers).includes('Internal'), false);
    assert.deepEqual(buildOfferSchemas(siteSeoConfig, projectMarketingPricing([], null)), []);
    const withoutTrial = buildOfferSchemas(siteSeoConfig, projectMarketingPricing([paidPlan('lifetime')], null));
    assert.equal(withoutTrial.length, 1);
    assert.equal(withoutTrial[0].name, 'Lifetime');
    assert.equal(withoutTrial[0].category, 'lifetime');
});

test('public price and storage formatting preserves real prices and binary units', () => {
    assert.equal(formatMarketingPrice(12.5, 'USD'), '$12.50');
    assert.equal(formatMarketingPrice(250, 'USD'), '$250');
    assert.equal(formatMarketingStorage(100 * 1024 ** 2), '100 MiB');
    assert.equal(formatMarketingStorage(2 * 1024 ** 3), '2 GiB');
    assert.equal(formatMarketingStorage(0), '0 MiB');
});

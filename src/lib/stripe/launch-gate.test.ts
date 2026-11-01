import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLiveBillingReady, REQUIRED_BILLING_CHECKS } from './launch-gate';
import { BILLING_CATALOG } from './catalog';
import type { BillingLaunchEvidence } from './launch-gate';

test('live billing requires complete payment and processing acceptance for the exact catalog and prices', () => {
    const names = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_METER_WEBHOOK_SECRET', 'BILLING_LAUNCH_EVIDENCE_JSON'] as const;
    const previous = Object.fromEntries(names.map(key => [key, process.env[key]]));
    try {
        process.env.STRIPE_SECRET_KEY = 'sk_live_fixture';
        delete process.env.BILLING_LAUNCH_EVIDENCE_JSON;
        assert.throws(() => assertLiveBillingReady('cost-v1'), /blocked/);
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fixture'; process.env.STRIPE_METER_WEBHOOK_SECRET = 'whsec_meter_fixture';
        const proof = { schemaVersion: 2, tariffVersion: BILLING_CATALOG.version, costVersion: 'cost-v1', stripeAccountId: 'acct_fixture', verifiedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 86400_000).toISOString(), priceIds: ['price_base', 'price_storage', 'price_audio'], checks: Object.fromEntries(REQUIRED_BILLING_CHECKS.map(check => [check, true])) };
        process.env.BILLING_LAUNCH_EVIDENCE_JSON = JSON.stringify(proof);
        assert.doesNotThrow(() => assertLiveBillingReady('cost-v1', ['price_base']));
        assert.doesNotThrow(() => assertLiveBillingReady('cost-v2', ['price_base']));
        assert.throws(() => assertLiveBillingReady('cost-v1', ['price_unknown']));
        process.env.BILLING_LAUNCH_EVIDENCE_JSON = JSON.stringify({ ...proof, checks: { ...proof.checks, invoiceRounding: false } });
        assert.throws(() => assertLiveBillingReady('cost-v1'));
        process.env.BILLING_LAUNCH_EVIDENCE_JSON = JSON.stringify({ ...proof, checks: { ...proof.checks, hostedPlanPayments: false } });
        assert.throws(() => assertLiveBillingReady('cost-v1'), /acceptance is incomplete/);
        process.env.STRIPE_SECRET_KEY = 'sk_test_fixture';
        assert.doesNotThrow(() => assertLiveBillingReady('cost-v1'));
    } finally { for (const key of names) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
});

test('reviewed catalog evidence supports new Stripe prices without an environment proof and rejects another bundle or account', async () => {
    const { assertCatalogBillingReady } = await import('./launch-gate');
    const names = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_METER_WEBHOOK_SECRET', 'BILLING_LAUNCH_EVIDENCE_JSON'] as const;
    const previous = Object.fromEntries(names.map(key => [key, process.env[key]]));
    try {
        process.env.STRIPE_SECRET_KEY = 'sk_live_fixture';
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fixture'; process.env.STRIPE_METER_WEBHOOK_SECRET = 'whsec_meter_fixture';
        delete process.env.BILLING_LAUNCH_EVIDENCE_JSON;
        const context = { catalogVersion: 'bundle-new', costFingerprint: 'audited-costs', stripeAccountId: 'acct_owner', livemode: true };
        const proof: BillingLaunchEvidence = { schemaVersion: 2, ...context, tariffVersion: BILLING_CATALOG.version, costVersion: 'cost-v1', priceIds: ['price_new'],
            verifiedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 86400_000).toISOString(),
            checks: Object.fromEntries(REQUIRED_BILLING_CHECKS.map(check => [check, true])) as BillingLaunchEvidence['checks'] };
        assert.doesNotThrow(() => assertCatalogBillingReady('cost-v1', ['price_new'], proof, context));
        assert.throws(() => assertCatalogBillingReady('cost-v1', ['price_new'], proof, { ...context, stripeAccountId: 'acct_other' }));
        assert.throws(() => assertCatalogBillingReady('cost-v1', ['price_new'], proof, { ...context, catalogVersion: 'bundle_other' }));
        assert.doesNotThrow(() => assertCatalogBillingReady(undefined, ['price_new'], { ...proof, expiresAt: '2020-01-01' }, { ...context, costFingerprint: 'changed_costs' }));
        assert.throws(() => assertCatalogBillingReady(undefined, ['price_new'], proof, { ...context, livemode: false }));
        assert.throws(() => assertCatalogBillingReady(undefined, ['price_new'], { ...proof, schemaVersion: undefined }, context));
    } finally { for (const key of names) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
});

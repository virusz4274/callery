import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { BILLING_CATALOG, getUsageMeterDefinitions, type UsagePricingTier } from './catalog';
import { invoiceLinePriceId, stripeObjectId } from './objects';
import { ATOMS_PER_CENT, createUsageTariffSnapshot, minimumBillableQuantity, quoteUsageQuantity, type UsageTariffPair, type UsageTariffSnapshot } from './usage-tariff';
import { readGrantTransactions } from './grant-transfer';

/**
 * Optional external acceptance, NOT complete launch evidence. No application DB,
 * application secrets, .env files, existing customer IDs or fallback credentials.
 * Run this file explicitly with these process-only variables:
 * VOSIFT_TEST_STRIPE_SECRET_KEY=sk_test_... (never STRIPE_SECRET_KEY)
 * VOSIFT_TEST_STRIPE_STORAGE_PRICE_ID=price_...
 * VOSIFT_TEST_STRIPE_TRANSCRIPTION_PRICE_ID=price_...
 * VOSIFT_TEST_STRIPE_LIFETIME_STORAGE_PRICE_ID=price_...
 * VOSIFT_TEST_STRIPE_LIFETIME_TRANSCRIPTION_PRICE_ID=price_...
 * VOSIFT_TEST_STRIPE_CASES=0 (optional comma-separated boundary indexes; default all7)
 *
 * Uses the production v1 ingestion endpoint with the v4 catalog. The v2 high
 * throughput stream is live-only. Real-time cancellation invoices avoid assuming
 * that advancing a test clock also advances asynchronous meter ingestion.
 * https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api
 * https://docs.stripe.com/api/subscriptions/cancel
 * https://docs.stripe.com/billing/subscriptions/usage-based/billing-credits
 * https://docs.stripe.com/products-prices/manage-prices#rounding
 */
const key = process.env.VOSIFT_TEST_STRIPE_SECRET_KEY?.trim();
const CASES = [0, 1, 2, 3, 4, 5, 6] as const;
function selectedCases(): number[] {
    const configured = process.env.VOSIFT_TEST_STRIPE_CASES;
    if (configured === undefined) return [...CASES];
    const values = configured.split(',').map(value => value.trim());
    if (!values.length || values.some(value => !/^[0-6]$/.test(value))) throw new Error('VOSIFT_TEST_STRIPE_CASES must list boundary indexes 0 through 6, for example 0 or 0,3,6.');
    return [...new Set(values.map(Number))];
}
function progress(boundaryIndex: number, stage: string, details: Record<string, unknown> = {}) {
    process.stdout.write(`${JSON.stringify({ partialAcceptanceOnly: true, boundaryIndex, stage, ...details })}\n`);
}
function diagnosticFailure(error: unknown): unknown {
    if (!(error instanceof Stripe.errors.StripeError)) return error;
    const reason = error.message.replace(/(?:sk|rk)_(?:test|live)_[A-Za-z0-9_]+|whsec_[A-Za-z0-9_]+/g, '[REDACTED]');
    return new Error(`Stripe sandbox API failed (${error.type}, ${error.code || 'no_code'}, request ${error.requestId || 'unknown'}): ${reason}. No launch proof was produced.`);
}
type UsagePair = { storage: string; transcription: string };
type TierPairs = Record<UsagePricingTier, UsagePair>;
type TierTariffs = Record<UsagePricingTier, UsageTariffPair>;

async function eventually<T>(description: string, read: () => Promise<T>, ready: (value: T) => boolean, timeoutMs = 120_000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    do {
        const value = await read();
        if (ready(value)) return value;
        await new Promise(resolve => setTimeout(resolve, 2000));
    } while (Date.now() < deadline);
    throw new Error(`Sandbox timed out waiting for ${description}; this is not acceptance evidence.`);
}

function requiredPrice(name: string): string {
    const value = process.env[name]?.trim();
    if (!value || !/^price_[A-Za-z0-9]+$/.test(value)) throw new Error(`Set an explicit sandbox ${name}; no application price fallback is allowed.`);
    return value;
}

async function validatePrice(stripe: Stripe, id: string, kind: 'storage' | 'transcription', tier: UsagePricingTier) {
    const definition = getUsageMeterDefinitions(tier)[kind];
    const price = await stripe.prices.retrieve(id);
    assert.equal(price.livemode, false, 'Every supplied price must belong to the sandbox');
    assert.equal(price.active, true);
    assert.equal(price.currency, 'usd');
    assert.equal(price.billing_scheme, 'per_unit');
    assert.equal(price.transform_quantity, null);
    assert.equal(price.recurring?.usage_type, 'metered');
    assert.equal(price.recurring.interval, 'month');
    assert.equal(price.recurring.interval_count, 1);
    const meterId = price.recurring.meter;
    assert.ok(meterId, 'A Billing Meter must be attached to the price');
    const meter = await stripe.billing.meters.retrieve(meterId);
    assert.equal(meter.livemode, false);
    assert.equal(meter.status, 'active');
    assert.equal(meter.event_name, definition.eventName);
    assert.equal(meter.default_aggregation.formula, kind === 'storage' ? 'last' : 'sum');
    assert.equal(meter.event_time_window ?? undefined, undefined, 'Pre-aggregated time-window meters are outside this catalog');
    assert.equal(meter.customer_mapping.event_payload_key, 'stripe_customer_id');
    assert.equal(meter.value_settings.event_payload_key, 'value');
    const tariff = createUsageTariffSnapshot({ catalogVersion: BILLING_CATALOG.version, usageTier: tier, kind, priceId: id,
        meterId: meter.id, eventName: meter.event_name, currency: 'usd', quantityUnit: kind === 'storage' ? 'milliGiB' : 'weighted_15s_block',
        aggregation: kind === 'storage' ? 'last' : 'sum', unitAmountDecimal: String(price.unit_amount_decimal ?? price.unit_amount),
        minimumChargeMicros: tier === 'recurring' && kind === 'transcription' ? 10_000 : 0 });
    return { price, meter, tariff };
}

async function allLines(stripe: Stripe, invoiceId: string) {
    const lines: Stripe.InvoiceLineItem[] = [];
    for await (const line of stripe.invoices.listLineItems(invoiceId, { limit: 100 })) lines.push(line);
    return lines;
}

function roundedMinor(tariff: UsageTariffSnapshot, quantity: number): number {
    return Number((BigInt(quoteUsageQuantity(tariff, quantity).exactAtoms) + ATOMS_PER_CENT / BigInt(2)) / ATOMS_PER_CENT);
}
function boundaryQuantities(tariff: UsageTariffSnapshot): number[] {
    const unit = BigInt(tariff.unitPriceAtoms), half = ATOMS_PER_CENT / BigInt(2) / unit, cent = ATOMS_PER_CENT / unit;
    return [BigInt(1), half - BigInt(1), half, half + BigInt(1), cent - BigInt(1), cent, cent + BigInt(1)].map(value => Math.max(1, Number(value)));
}

async function runCase(t: TestContext, stripe: Stripe, tierPrices: TierPairs, tierTariffs: TierTariffs, boundaryIndex: number) {
    const runId = randomUUID();
    const customer = await stripe.customers.create({ name: `VoSift sandbox rounding ${boundaryIndex}`, address: { line1: '1 Sandbox Test Avenue', city: 'San Francisco', state: 'CA', postal_code: '94103', country: 'US' }, metadata: { vosift_sandbox_fixture: runId } }, { idempotencyKey: `sandbox-customer:${runId}` });
    assert.equal(customer.livemode, false);
    progress(boundaryIndex, 'fixture_created', { customerId: customer.id });
    const subscriptions: string[] = [];
    let grantId: string | undefined;
    const grantIds: string[] = [];
    t.after(async () => {
        // Only this newly-created customer is ever selected for mutation.
        const failures: string[] = [];
        for (const id of subscriptions) try {
            const current = await stripe.subscriptions.retrieve(id);
            if (current.status !== 'canceled') await stripe.subscriptions.cancel(id, { invoice_now: false, prorate: false });
        } catch { failures.push(id); }
        try {
            for await (const invoice of stripe.invoices.list({ customer: customer.id, limit: 100 })) {
                if (invoice.status === 'draft') await stripe.invoices.del(invoice.id);
                else if (invoice.status === 'open') await stripe.invoices.voidInvoice(invoice.id);
            }
        } catch { failures.push('fixture invoices'); }
        for (const id of grantIds) try {
            const grant = await stripe.billing.creditGrants.retrieve(id);
            if (!grant.voided_at && (!grant.expires_at || grant.expires_at > Date.now() / 1000)) await stripe.billing.creditGrants.expire(id);
        } catch { failures.push(id); }
        try { await stripe.customers.del(customer.id); } catch { failures.push(customer.id); }
        if (failures.length) throw new Error(`Sandbox fixture cleanup needs attention: ${failures.join(', ')}`);
    });

    // Synthetic paid-category credit tests applicability only. No payment is
    // collected; this does not prove top-up payment or funding fulfillment.
    const allPrices = [...Object.values(tierPrices.recurring), ...Object.values(tierPrices.lifetime)].sort();
    assert.equal(new Set(allPrices).size, 4, 'Both usage tiers require distinct storage and transcription prices');
    const grant = await stripe.billing.creditGrants.create({ customer: customer.id, category: 'paid',
        amount: { type: 'monetary', monetary: { currency: 'usd', value: 1000 } },
        applicability_config: { scope: { prices: Object.values(tierPrices.recurring).map(id => ({ id })) } },
        metadata: { vosift_sandbox_fixture: runId }, name: 'VoSift isolated sandbox fixture' }, { idempotencyKey: `sandbox-grant:${runId}` });
    grantId = grant.id; grantIds.push(grant.id);
    assert.deepEqual(grant.applicability_config.scope.prices?.map(price => price.id).sort(), Object.values(tierPrices.recurring).sort());
    assert.equal(grant.applicability_config.scope.price_type, undefined);

    // The remaining paid-category principal moves through an exact expiry debit
    // into one union-scoped replacement. No new cash or local credit is minted.
    // This diagnostic does not exercise the application's $250 purchase.
    for (const tier of ['recurring', 'lifetime'] as const) {
        const prices = tierPrices[tier], tariffs = tierTariffs[tier];
        const storageQuantity = boundaryQuantities(tariffs.storage)[boundaryIndex];
        const transcriptionQuantity = tier === 'recurring' ? minimumBillableQuantity(tariffs.transcription, 1) : boundaryQuantities(tariffs.transcription)[boundaryIndex];
        const transcriptionMinor = roundedMinor(tariffs.transcription, transcriptionQuantity);
        const storageMinorExpected = roundedMinor(tariffs.storage, storageQuantity);

        progress(boundaryIndex, 'tier_started', { tier, storageQuantity, transcriptionQuantity });
        // The synthetic billing address permits invoice finalization on Indian
        // accounts. No email or payment method is attached; the control stays unpaid.
        const subscription = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: prices.storage }, { price: prices.transcription }],
            billing_mode: { type: 'flexible' }, payment_behavior: 'allow_incomplete', automatic_tax: { enabled: false }, default_tax_rates: [],
            metadata: { vosift_sandbox_fixture: runId } }, { idempotencyKey: `sandbox-subscription:${runId}:${tier}` });
        subscriptions.push(subscription.id);
        assert.equal(subscription.livemode, false);
        assert.equal(subscription.status, 'active');
        const control = await stripe.invoiceItems.create({ customer: customer.id, subscription: subscription.id, currency: 'usd', amount: 100,
            description: `Ineligible one-off control ${tier} ${runId}`, metadata: { vosift_sandbox_fixture: runId } }, { idempotencyKey: `sandbox-control:${runId}:${tier}` });

        const timestamp = Math.floor(Date.now() / 1000);
        if (tier === 'recurring') assert.ok(transcriptionMinor >= 1, 'Positive recurring overage has a one-cent minimum');
        for (const [kind, value] of [['storage', storageQuantity], ['transcription', transcriptionQuantity]] as const) {
            const identifier = `vosift-sandbox:${runId}:${tier}:${kind}`;
            await stripe.billing.meterEvents.create({ event_name: getUsageMeterDefinitions(tier)[kind].eventName, identifier, timestamp,
                payload: { stripe_customer_id: customer.id, value: String(value) } }, { idempotencyKey: identifier });
            progress(boundaryIndex, 'meter_accepted', { tier, kind, value });
            const start = Math.floor(timestamp / 60) * 60, end = start + 60;
            await eventually(`${kind} meter aggregation`, async () => {
                const summary = await stripe.billing.meters.listEventSummaries(tariffs[kind].meterId, { customer: customer.id, start_time: start, end_time: end, limit: 100 });
                return summary.data.reduce((sum, row) => sum + row.aggregated_value, 0);
            }, total => total === value);
            progress(boundaryIndex, 'meter_processed', { tier, kind, value });
        }
        await eventually('usage quantities on the invoice preview', () => stripe.invoices.createPreview({ customer: customer.id, subscription: subscription.id }), preview =>
            preview.lines.data.some(line => invoiceLinePriceId(line) === prices.storage && line.quantity === storageQuantity)
            && preview.lines.data.some(line => invoiceLinePriceId(line) === prices.transcription && line.quantity === transcriptionQuantity));
        progress(boundaryIndex, 'preview_verified', { tier, subscriptionId: subscription.id });
        // Ensure event time is strictly inside [period.start, period.end).
        if (Math.floor(Date.now() / 1000) <= timestamp) await new Promise(resolve => setTimeout(resolve, 1100));
        await stripe.subscriptions.cancel(subscription.id, { invoice_now: true, prorate: false }, { idempotencyKey: `sandbox-cancel:${runId}:${tier}` });

        const invoice = await eventually('the final metered cancellation invoice', async () => {
            for await (const candidate of stripe.invoices.list({ customer: customer.id, subscription: subscription.id, limit: 100 })) {
                const lines = await allLines(stripe, candidate.id);
                if (lines.some(line => invoiceLinePriceId(line) === prices.storage && line.quantity === storageQuantity)
                    && lines.some(line => invoiceLinePriceId(line) === prices.transcription && line.quantity === transcriptionQuantity)) return candidate;
            }
            return null;
        }, value => value !== null);
        assert.ok(invoice);
        progress(boundaryIndex, 'finalizing_invoice', { tier, invoiceId: invoice.id });
        const finalized = invoice.status === 'draft' ? await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: false }) : invoice;
        assert.ok(['open', 'paid'].includes(finalized.status || ''));
        const lines = await allLines(stripe, finalized.id);
        const transcription = lines.find(line => invoiceLinePriceId(line) === prices.transcription)!;
        const storage = lines.find(line => invoiceLinePriceId(line) === prices.storage)!;
        assert.equal(transcription.subtotal ?? transcription.amount, transcriptionMinor,
            tier === 'recurring' ? 'The recording minimum must be derived from the imported Stripe unit price' : 'Lifetime must rate the weighted blocks without adding the recurring recording minimum');
        const storageMinor = storage.subtotal ?? storage.amount;
        assert.equal(storageMinor, storageMinorExpected, 'Storage must match fixed-point nearest-minor-unit rounding, with half cents rounded up');

        progress(boundaryIndex, 'invoice_amounts_verified', { tier, invoiceId: finalized.id, storageMinor, transcriptionMinor });
        const applied = await eventually('per-line credit grant debits', async () => {
            const amounts = new Map<string, number>();
            for await (const transaction of stripe.billing.creditBalanceTransactions.list({ customer: customer.id, limit: 100 })) {
                const debit = transaction.debit;
                if (transaction.type !== 'debit' || debit?.type !== 'credits_applied' || stripeObjectId(debit.credits_applied?.invoice) !== finalized.id) continue;
                assert.equal(stripeObjectId(transaction.credit_grant), grantId);
                assert.equal(debit.amount.monetary?.currency, 'usd');
                const lineId = debit.credits_applied!.invoice_line_item;
                amounts.set(lineId, (amounts.get(lineId) || 0) + (debit.amount.monetary?.value || 0));
            }
            return amounts;
        }, amounts => (amounts.get(transcription.id) || 0) === transcriptionMinor && (amounts.get(storage.id) || 0) === storageMinor);
        progress(boundaryIndex, 'grant_debits_verified', { tier, invoiceId: finalized.id });
        const controlLine = lines.find(line => line.parent?.invoice_item_details?.invoice_item === control.id);
        assert.ok(controlLine, 'The final invoice must contain the one-off applicability control');
        assert.equal(applied.get(controlLine.id) || 0, 0, 'Usage credit must not pay the ineligible one-off line');
        assert.equal(controlLine.amount, 100);
        t.diagnostic(JSON.stringify({ partialAcceptanceOnly: true, catalogVersion: BILLING_CATALOG.version, customerId: customer.id,
            usageTier: tier, subscriptionId: subscription.id, invoiceId: finalized.id, storageQuantity, storageMinor, transcriptionQuantity, transcriptionMinor,
            grantId, scopedPriceIds: allPrices, debitsMinor: Object.fromEntries(applied), ineligibleControlMinor: 100 }));
        if (tier === 'recurring') {
            await stripe.billing.creditGrants.expire(grantId!, {}, { idempotencyKey: `sandbox-expire-origin:${runId}` });
            const proof = await eventually('the exact origin expiry debit', () => readGrantTransactions(stripe, customer.id, grantId!), value => value.remainingMinor === 0 && value.expiredMinor > 0);
            assert.equal(proof.creditMinor, 1000);
            assert.equal(proof.expiredMinor + proof.appliedMinor, 1000);
            const replacement = await stripe.billing.creditGrants.create({ customer: customer.id, category: 'paid',
                amount: { type: 'monetary', monetary: { currency: 'usd', value: proof.expiredMinor } },
                applicability_config: { scope: { prices: allPrices.map(id => ({ id })) } },
                metadata: { vosift_sandbox_fixture: runId, originalGrantId: grant.id }, name: 'VoSift isolated exact carry-forward' }, { idempotencyKey: `sandbox-union-grant:${runId}` });
            assert.equal(replacement.amount.monetary!.value, proof.expiredMinor);
            assert.deepEqual(replacement.applicability_config.scope.prices?.map(price => price.id).sort(), allPrices);
            grantId = replacement.id; grantIds.push(replacement.id);
            progress(boundaryIndex, 'grant_rollover_verified', { originalGrantId: grant.id, replacementGrantId: replacement.id, carriedPrincipalMinor: proof.expiredMinor });
            t.diagnostic(JSON.stringify({ partialAcceptanceOnly: true, originalGrantId: grant.id, replacementGrantId: replacement.id,
                expiredDebitIds: proof.expiredIds, carriedPrincipalMinor: proof.expiredMinor, noNewCash: true }));
        }
    }
    progress(boundaryIndex, 'case_completed');
}

test('opt-in real Stripe sandbox: both usage tariffs, rounding and four-price grant debit proof', { skip: !key, timeout: 40 * 60_000 }, async t => {
    if (!key?.startsWith('sk_test_')) throw new Error('VOSIFT_TEST_STRIPE_SECRET_KEY must be an explicit sk_test_ key. Live or fallback keys are forbidden.');
    const cases = selectedCases();
    const prices: TierPairs = {
        recurring: { storage: requiredPrice('VOSIFT_TEST_STRIPE_STORAGE_PRICE_ID'), transcription: requiredPrice('VOSIFT_TEST_STRIPE_TRANSCRIPTION_PRICE_ID') },
        lifetime: { storage: requiredPrice('VOSIFT_TEST_STRIPE_LIFETIME_STORAGE_PRICE_ID'), transcription: requiredPrice('VOSIFT_TEST_STRIPE_LIFETIME_TRANSCRIPTION_PRICE_ID') },
    };
    assert.equal(new Set([...Object.values(prices.recurring), ...Object.values(prices.lifetime)]).size, 4, 'Supply four distinct sandbox meter prices');
    const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 0, timeout: 30_000 });
    try {
        const tariffs = { recurring: {}, lifetime: {} } as TierTariffs;
        for (const tier of ['recurring', 'lifetime'] as const) for (const kind of ['storage', 'transcription'] as const) {
            const validated = await validatePrice(stripe, prices[tier][kind], kind, tier);
            tariffs[tier][kind] = validated.tariff;
        }
        for (const boundaryIndex of cases) {
            let failure: unknown;
            await t.test(`both tariffs around imported-price rounding boundary ${boundaryIndex}`, async child => {
                try { await runCase(child, stripe, prices, tariffs, boundaryIndex); }
                catch (error) {
                    failure = diagnosticFailure(error);
                    progress(boundaryIndex, 'case_failed', { error: failure instanceof Error ? failure.message : 'Unknown failure' });
                    throw failure;
                }
            });
            if (failure) throw new Error(`Sandbox diagnostics stopped after failed boundary ${boundaryIndex}; remaining cases were not run.`);
        }
    } catch (error) {
        throw diagnosticFailure(error);
    }
});

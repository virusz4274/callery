import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Stripe from 'stripe';
import { withBillingLease } from './billing-lock';
import { coordinateBillingSchedule, syncScheduledBillingBoundary, NORMAL_PRORATION_POLICY_VERSION } from './subscription-schedule';
import { invoiceLinePriceId, stripeObjectId } from './objects';
import { MemoryBillingDatabase, userFixture, planFixture } from './test-support';
import { createUsageTariffSnapshot, type UsageTariffPair } from './usage-tariff';
import type { BillingChangeOperation } from './plan-change';
import type { UsagePriceRollout } from './usage-price-rollout';
import { BillingSyncPendingError } from './billing-errors';
import { completeHostedPayment } from '../../../scripts/stripe-app-sandbox.mjs';

/** Explicit opt-in, only newly owned sandbox resources; never application DB or fallback credentials.
 * Synthetic paid-category grants prove Stripe applicability, not top-up collection or live launch.
 */
const key = process.env.VOSIFT_TEST_STRIPE_SECRET_KEY?.trim();
async function eventually<T>(read: () => Promise<T>, ready: (value: T) => boolean, label: string, timeout = 120_000): Promise<T> {
    const until = Date.now() + timeout;
    do { const value = await read(); if (ready(value)) return value; await new Promise(resolve => setTimeout(resolve, 2000)); } while (Date.now() < until);
    throw new Error(`Stripe sandbox did not confirm ${label}. No acceptance proof was produced.`);
}
function safeFailure(error: unknown): unknown {
    if (!(error instanceof Stripe.errors.StripeError)) return error;
    return new Error(`Stripe sandbox ${error.type} (${error.code || 'no_code'}, request ${error.requestId || 'unknown'}): ${error.message.replace(/(?:sk|rk)_(?:test|live)_[A-Za-z0-9_]+|whsec_[A-Za-z0-9_]+/g, '[REDACTED]')}`);
}

test('opt-in real Stripe sandbox: one broad metered grant covers both families and replacement Prices, excluding base and Lifetime purchases',
    { skip: !key, timeout: 540_000 }, async t => {
        assert.ok(key && key.startsWith('sk_test_'), 'Only an explicitly supplied sandbox key is permitted.');
        const stripe = new Stripe(key, { maxNetworkRetries: 0, timeout: 30_000, httpClient: Stripe.createFetchHttpClient() });
        const run = randomUUID(), metadata = { vosift_simplified_billing: run }, customers: string[] = [], products: string[] = [], prices: string[] = [], meters: string[] = [], subscriptions: string[] = [];
        let clockId: string | undefined;
        t.after(async () => {
            const failures: string[] = [];
            for (const id of subscriptions) try {
                const row = await stripe.subscriptions.retrieve(id); assert.equal(row.livemode, false); assert.equal(row.metadata.vosift_simplified_billing, run);
                if (row.status !== 'canceled') await stripe.subscriptions.cancel(id, { invoice_now: false, prorate: false });
            } catch { failures.push(id); }
            for (const id of customers) try {
                const row = await stripe.customers.retrieve(id); assert.equal(row.deleted, undefined); assert.equal(row.metadata.vosift_simplified_billing, run);
                for await (const invoice of stripe.invoices.list({ customer: id, limit: 100 })) {
                    if (invoice.status === 'draft') await stripe.invoices.del(invoice.id);
                    else if (invoice.status === 'open') await stripe.invoices.voidInvoice(invoice.id);
                }
                await stripe.customers.del(id);
            } catch { failures.push(id); }
            if (clockId) try { await stripe.testHelpers.testClocks.del(clockId); } catch { failures.push(clockId); }
            for (const id of prices) try { const row = await stripe.prices.retrieve(id); assert.equal(row.metadata.vosift_simplified_billing, run); await stripe.prices.update(id, { active: false }); } catch { failures.push(id); }
            for (const id of products) try { const row = await stripe.products.retrieve(id); assert.equal(row.metadata.vosift_simplified_billing, run); await stripe.products.update(id, { active: false }); } catch { failures.push(id); }
            for (const id of meters) try { await stripe.billing.meters.deactivate(id); } catch { failures.push(id); }
            assert.deepEqual(failures, [], 'Only owned fixture resources may require cleanup.');
        });
        try {
            const product = await stripe.products.create({ name: `VoSift simplified billing sandbox ${run}`, metadata }); products.push(product.id);
            const base = await stripe.prices.create({ product: product.id, currency: 'usd', unit_amount: 1000, recurring: { interval: 'month', usage_type: 'licensed' }, metadata }); prices.push(base.id);
            const pro = await stripe.prices.create({ product: product.id, currency: 'usd', unit_amount: 2000, recurring: { interval: 'month', usage_type: 'licensed' }, metadata }); prices.push(pro.id);
            const lifetime = await stripe.prices.create({ product: product.id, currency: 'usd', unit_amount: 25000, metadata }); prices.push(lifetime.id);
            const pairs: Record<string, UsageTariffPair> = {};
            for (const family of ['recurring', 'lifetime', 'replacement'] as const) {
                const pair: Partial<UsageTariffPair> = {};
                for (const kind of ['storage', 'transcription'] as const) {
                    const event = `vs_simplify_${run.replaceAll('-', '')}_${family}_${kind}`;
                    const meter = await stripe.billing.meters.create({ display_name: `Sandbox ${family} ${kind}`, event_name: event,
                        default_aggregation: { formula: kind === 'storage' ? 'last' : 'sum' }, customer_mapping: { type: 'by_id', event_payload_key: 'stripe_customer_id' }, value_settings: { event_payload_key: 'value' } });
                    meters.push(meter.id);
                    const rate = kind === 'storage' ? family === 'replacement' ? '0.03' : '0.02' : family === 'replacement' ? '0.5' : '0.25';
                    const price = await stripe.prices.create({ product: product.id, currency: 'usd', unit_amount_decimal: Stripe.Decimal.from(rate),
                        recurring: { interval: 'month', usage_type: 'metered', meter: meter.id }, metadata }); prices.push(price.id);
                    pair[kind] = createUsageTariffSnapshot({ catalogVersion: run, usageTier: family === 'lifetime' ? 'lifetime' : 'recurring', kind,
                        priceId: price.id, meterId: meter.id, eventName: event, currency: 'usd', quantityUnit: kind === 'storage' ? 'milliGiB' : 'weighted_15s_block',
                        aggregation: kind === 'storage' ? 'last' : 'sum', unitAmountDecimal: rate, minimumChargeMicros: kind === 'transcription' && family !== 'lifetime' ? 10_000 : 0 });
                }
                pairs[family] = pair as UsageTariffPair;
            }
            const customer = await stripe.customers.create({ name: 'Owned fictional sandbox account', address: { line1: '1 Sandbox Test Avenue', city: 'San Francisco', state: 'CA', postal_code: '94103', country: 'US' }, metadata }); customers.push(customer.id);
            const grant = await stripe.billing.creditGrants.create({ customer: customer.id, category: 'paid', amount: { type: 'monetary', monetary: { currency: 'usd', value: 500 } }, applicability_config: { scope: { price_type: 'metered' } }, metadata });
            assert.equal(grant.applicability_config.scope.price_type, 'metered'); assert.equal(grant.applicability_config.scope.prices, undefined);
            const baseControl = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: base.id, quantity: 1 }],
                billing_mode: { type: 'flexible' }, payment_behavior: 'default_incomplete', automatic_tax: { enabled: false }, metadata });
            subscriptions.push(baseControl.id);
            const baseInvoice = await stripe.invoices.retrieve(stripeObjectId(baseControl.latest_invoice)!);
            assert.equal(baseInvoice.status, 'open'); assert.equal(baseInvoice.total, 1000); assert.equal(baseInvoice.amount_remaining, 1000,
                'Metered credit must not reduce an ordinary upfront base subscription invoice');
            for (const family of ['recurring', 'lifetime', 'replacement'] as const) {
                const pair = pairs[family];
                const subscription = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: pair.storage.priceId }, { price: pair.transcription.priceId }],
                    billing_mode: { type: 'flexible' }, payment_behavior: 'allow_incomplete', automatic_tax: { enabled: false }, metadata }); subscriptions.push(subscription.id);
                assert.equal(subscription.status, 'active');
                const controls: Stripe.InvoiceItem[] = [];
                if (family === 'recurring') {
                    controls.push(await stripe.invoiceItems.create({ customer: customer.id, subscription: subscription.id, pricing: { price: lifetime.id }, quantity: 1, metadata }));
                }
                const timestamp = Math.floor(Date.now() / 1000), quantities = { storage: 25, transcription: 4 };
                for (const kind of ['storage', 'transcription'] as const) await stripe.billing.meterEvents.create({ event_name: pair[kind].eventName,
                    identifier: `simplified:${run}:${family}:${kind}`, timestamp, payload: { stripe_customer_id: customer.id, value: String(quantities[kind]) } });
                await eventually(() => stripe.invoices.createPreview({ customer: customer.id, subscription: subscription.id }), preview =>
                    ['storage', 'transcription'].every(key => preview.lines.data.some(line => invoiceLinePriceId(line) === pair[key as keyof UsageTariffPair].priceId && line.quantity === quantities[key as keyof typeof quantities])), `${family} quantities`);
                if (Math.floor(Date.now() / 1000) <= timestamp) await new Promise(resolve => setTimeout(resolve, 1100));
                await stripe.subscriptions.cancel(subscription.id, { invoice_now: true, prorate: false });
                const invoice = await eventually(async () => {
                    for await (const row of stripe.invoices.list({ customer: customer.id, subscription: subscription.id, limit: 100 })) {
                        const lines = await stripe.invoices.listLineItems(row.id, { limit: 100 });
                        if (lines.data.some(line => invoiceLinePriceId(line) === pair.transcription.priceId && line.quantity === 4)) return row;
                    }
                    return null;
                }, row => row !== null, `${family} final invoice`);
                assert.ok(invoice);
                const finalized = invoice.status === 'draft' ? await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: false }) : invoice;
                const lines = await stripe.invoices.listLineItems(invoice.id, { limit: 100 });
                const usage = lines.data.filter(line => [pair.storage.priceId, pair.transcription.priceId].includes(invoiceLinePriceId(line)!));
                assert.equal(usage.length, 2); assert.equal(usage.reduce((sum, line) => sum + line.amount, 0), family === 'replacement' ? 3 : 2);
                const debits = await eventually(async () => {
                    const amounts = new Map<string, number>();
                    for await (const transaction of stripe.billing.creditBalanceTransactions.list({ customer: customer.id, limit: 100 })) {
                        if (transaction.type !== 'debit' || transaction.debit?.type !== 'credits_applied' || stripeObjectId(transaction.debit.credits_applied?.invoice) !== finalized.id) continue;
                        assert.equal(stripeObjectId(transaction.credit_grant), grant.id);
                        const id = transaction.debit.credits_applied!.invoice_line_item;
                        amounts.set(id, (amounts.get(id) || 0) + transaction.debit.amount.monetary!.value);
                    }
                    return amounts;
                }, amounts => usage.every(line => amounts.get(line.id) === line.amount), `${family} grant debits`);
                for (const control of controls) {
                    const line = lines.data.find(line => line.parent?.invoice_item_details?.invoice_item === control.id); assert.ok(line);
                    assert.equal(debits.get(line.id) || 0, 0);
                }
                t.diagnostic(JSON.stringify({ partialAcceptanceOnly: true, family, customerId: customer.id, grantId: grant.id, invoiceId: finalized.id,
                    quantity: quantities, usageMinor: usage.reduce((sum, line) => sum + line.amount, 0), excludedPurchaseMinor: controls.length ? 25000 : 0,
                    excludedBaseInvoiceId: baseInvoice.id, excludedBaseMinor: 1000 }));
            }

            // A separate test clock proves actual Stripe boundary execution without
            // assuming that advancing a clock processes asynchronous meter ingestion.
            const frozen = Math.floor(Date.now() / 1000), clock = await stripe.testHelpers.testClocks.create({ frozen_time: frozen, name: `Owned schedule ${run}` }); clockId = clock.id;
            const clockCustomer = await stripe.customers.create({ name: 'Owned schedule account', test_clock: clock.id,
                email: `vosift-schedule-${run}@example.invalid`,
                address: { line1: '1 Sandbox Test Avenue', city: 'San Francisco', state: 'CA', postal_code: '94103', country: 'US' }, metadata }); customers.push(clockCustomer.id);
            const method = await stripe.paymentMethods.create({ type: 'card', card: { token: 'tok_visa' }, metadata });
            await stripe.paymentMethods.attach(method.id, { customer: clockCustomer.id });
            await stripe.customers.update(clockCustomer.id, { invoice_settings: { default_payment_method: method.id } });
            const payOwnedInvoice = async (invoiceId: string) => {
                let invoice = await stripe.invoices.retrieve(invoiceId); assert.equal(stripeObjectId(invoice.customer), clockCustomer.id); assert.equal(invoice.livemode, false);
                if (invoice.status === 'draft') invoice = await stripe.invoices.finalizeInvoice(invoiceId, { auto_advance: false });
                if (invoice.status !== 'paid') try { invoice = await stripe.invoices.pay(invoiceId, { payment_method: method.id }); }
                catch (error) { if (!(error instanceof Stripe.errors.StripeCardError)) throw error; invoice = await stripe.invoices.retrieve(invoiceId); }
                if (invoice.status !== 'paid') {
                    assert.ok(invoice.hosted_invoice_url);
                    await completeHostedPayment(invoice.hosted_invoice_url, async () => (await stripe.invoices.retrieve(invoiceId)).status === 'paid',
                        join(tmpdir(), `vosift-schedule-${run}.json`), `schedule-${invoiceId}`, false, { require3ds: true });
                    invoice = await stripe.invoices.retrieve(invoiceId);
                }
                assert.equal(invoice.status, 'paid'); return invoice;
            };
            let initial = await stripe.subscriptions.create({ customer: clockCustomer.id, items: [{ price: pro.id }, { price: pairs.recurring.storage.priceId }, { price: pairs.recurring.transcription.priceId }],
                collection_method: 'charge_automatically', payment_behavior: 'default_incomplete', default_payment_method: method.id,
                billing_mode: { type: 'flexible' }, automatic_tax: { enabled: false }, metadata }); subscriptions.push(initial.id);
            await payOwnedInvoice(stripeObjectId(initial.latest_invoice)!); initial = await stripe.subscriptions.retrieve(initial.id);
            assert.equal(initial.status, 'active');
            const end = Math.min(...initial.items.data.map(item => item.current_period_end)), memory = new MemoryBillingDatabase();
            const user = userFixture({ stripeCustomerId: clockCustomer.id, stripeSubscriptionId: initial.id, stripeSubscriptionStatus: 'active',
                planKey: 'pro', stripePriceId: pro.id, billingEntitlement: { source: 'subscription', reference: initial.id, grantedAt: new Date(frozen * 1000) }, billingUsageTariffs: pairs.recurring,
                billingPaidBasePeriod: undefined });
            memory.collection('users').values.push(user as never);
            const target = planFixture({ stripePriceId: base.id, limits: { storage: 2 * 1024 ** 3, transcription: 3600 } });
            const operation = { _id: `sandbox-downgrade:${run}`, authSubject: user.authSubject, customerId: clockCustomer.id, subscriptionId: initial.id,
                state: 'scheduled', target, creditPolicyVersion: NORMAL_PRORATION_POLICY_VERSION, preview: { effectiveAt: new Date(end * 1000).toISOString() } } as BillingChangeOperation;
            memory.collection('billing_operations').values.push(operation as never);
            memory.collection('billing_usage_price_rollouts').values.push({ _id: `sandbox-rollout:${run}`, authSubject: user.authSubject, customerId: clockCustomer.id, subscriptionId: initial.id,
                state: 'scheduled', scheduleCoordinator: 1, noticedAt: new Date((end - 31 * 86400) * 1000), effectiveAt: new Date(end * 1000), targetTariffs: pairs.replacement, targetCatalogVersion: run } as unknown as UsagePriceRollout as never);
            const runtime = { db: memory.asDb(), stripe };
            await withBillingLease(runtime.db, user.authSubject, (current, owner) => coordinateBillingSchedule(current, owner, runtime, new Date(frozen * 1000)));
            await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: end + 60 });
            await eventually(() => stripe.testHelpers.testClocks.retrieve(clock.id), row => row.status === 'ready', 'test clock advance');
            const changed = await stripe.subscriptions.retrieve(initial.id);
            assert.deepEqual(changed.items.data.map(item => item.price.id).sort(), [base.id, pairs.replacement.storage.priceId, pairs.replacement.transcription.priceId].sort());
            const renewalId = stripeObjectId(changed.latest_invoice)!;
            const renewalBeforePayment = await stripe.invoices.retrieve(renewalId);
            if (renewalBeforePayment.status !== 'paid') await assert.rejects(syncScheduledBillingBoundary(user.authSubject, runtime, new Date((end + 60) * 1000)), BillingSyncPendingError);
            const paidRenewal = await payOwnedInvoice(renewalId); assert.equal(paidRenewal.amount_paid, 1000);
            await syncScheduledBillingBoundary(user.authSubject, runtime, new Date((end + 60) * 1000));
            assert.equal(memory.user().planKey, 'standard'); assert.equal(memory.user().storageAllocation, target.limits.storage);
            assert.deepEqual(memory.user().billingUsageTariffs, pairs.replacement);
            t.diagnostic(JSON.stringify({ partialAcceptanceOnly: true, stripeScheduleExecuted: true, subscriptionId: initial.id,
                scheduleId: memory.user().billingSchedule?.scheduleId, effectiveAt: new Date(end * 1000).toISOString(), targetPlanKey: 'standard', catalogVersion: run }));
        } catch (error) { throw safeFailure(error); }
    });

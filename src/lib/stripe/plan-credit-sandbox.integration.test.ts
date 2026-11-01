import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ObjectId } from 'mongodb';
import Stripe from 'stripe';
import type { BillingChangeOperation } from './plan-change';
import { assertHostedPlanInvoice, createHostedPlanInvoice, hostedLineTaxBasis, isSourceBaseCredit,
    prepareHostedPlanInvoice, type HostedPlanInvoiceContext } from './plan-change-payment';
import { NORMAL_PRORATION_POLICY_VERSION } from './subscription-schedule';
import { invoiceLinePriceId, stripeObjectId } from './objects';
import { completeHostedPayment } from '../../../scripts/stripe-app-sandbox.mjs';

/** Explicit sandbox-only invoice arithmetic diagnostic, not launch acceptance.
 * No .env loading, application DB, existing customers, or fallback Stripe key.
 * Exercises ordinary Stripe unused-time proration without expense-based credit retention.
 */
const sandboxKey = process.env.VOSIFT_TEST_STRIPE_SECRET_KEY?.trim();
const marker = 'vosift_plan_credit_fixture';

function safeFailure(error: unknown): unknown {
    if (!(error instanceof Stripe.errors.StripeError)) return error;
    const message = error.message.replace(/(?:sk|rk)_(?:test|live)_[A-Za-z0-9_]+|whsec_[A-Za-z0-9_]+/g, '[REDACTED]');
    return new Error(`Stripe credit diagnostic failed (${error.type}, ${error.code || 'no_code'}, request ${error.requestId || 'unknown'}): ${message}. No launch proof was produced.`);
}

test('opt-in real Stripe sandbox: ordinary unused-time proration matches a paid hosted invoice without retention',
    { skip: !sandboxKey, timeout: 360_000 }, async t => {
        assert.ok(sandboxKey && sandboxKey.startsWith('sk_test_'), 'Supply explicit VOSIFT_TEST_STRIPE_SECRET_KEY=sk_test_…; live and fallback keys are forbidden.');
        const stripe = new Stripe(sandboxKey, { maxNetworkRetries: 0, timeout: 30_000, httpClient: Stripe.createFetchHttpClient() });
        const runId = randomUUID(), operationId = `sandbox-credit:${runId}`, metadata = { [marker]: runId };
        let customerId: string | undefined, subscriptionId: string | undefined;
        const products: string[] = [], prices: string[] = [];
        const ownedCustomer = async () => {
            assert.ok(customerId);
            const customer = await stripe.customers.retrieve(customerId);
            assert.equal(customer.deleted, undefined);
            assert.equal(customer.livemode, false);
            assert.equal(customer.metadata[marker], runId);
            return customer;
        };
        t.after(async () => {
            const failures: string[] = [];
            if (customerId) {
                try {
                    await ownedCustomer();
                    if (subscriptionId) {
                        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                        assert.equal(subscription.livemode, false); assert.equal(subscription.metadata[marker], runId);
                        assert.equal(stripeObjectId(subscription.customer), customerId);
                        if (subscription.status !== 'canceled') await stripe.subscriptions.cancel(subscription.id,
                            { invoice_now: false, prorate: false }, { idempotencyKey: `credit-clean-sub:${runId}` });
                    }
                    for await (const invoice of stripe.invoices.list({ customer: customerId, limit: 100 })) {
                        assert.equal(invoice.livemode, false); assert.equal(stripeObjectId(invoice.customer), customerId);
                        if (invoice.status === 'draft') await stripe.invoices.del(invoice.id, {}, { idempotencyKey: `credit-clean-draft:${runId}:${invoice.id}` });
                        else if (invoice.status === 'open') await stripe.invoices.voidInvoice(invoice.id, {}, { idempotencyKey: `credit-clean-open:${runId}:${invoice.id}` });
                    }
                    await stripe.customers.del(customerId, {}, { idempotencyKey: `credit-clean-customer:${runId}` });
                } catch { failures.push(customerId); }
            }
            for (const id of prices) try {
                const price = await stripe.prices.retrieve(id);
                assert.equal(price.livemode, false); assert.equal(price.metadata[marker], runId);
                await stripe.prices.update(id, { active: false }, { idempotencyKey: `credit-clean-price:${runId}:${id}` });
            } catch { failures.push(id); }
            for (const id of products) try {
                const product = await stripe.products.retrieve(id);
                assert.equal(product.deleted, undefined); assert.equal(product.livemode, false); assert.equal(product.metadata[marker], runId);
                await stripe.products.update(id, { active: false }, { idempotencyKey: `credit-clean-product:${runId}:${id}` });
            } catch { failures.push(id); }
            assert.deepEqual(failures, [], `Owned sandbox fixture cleanup needs attention: ${failures.join(', ')}`);
        });

        try {
            const customer = await stripe.customers.create({ name: 'VoSift isolated plan-credit diagnostic', email: `vosift-credit-${runId}@example.invalid`,
                address: { line1: '1 Sandbox Test Avenue', city: 'San Francisco', state: 'CA', postal_code: '94103', country: 'US' }, metadata },
            { idempotencyKey: `credit-customer:${runId}` });
            customerId = customer.id; await ownedCustomer();
            const method = await stripe.paymentMethods.create({ type: 'card', card: { token: 'tok_visa' }, metadata },
                { idempotencyKey: `credit-method:${runId}` });
            assert.equal(method.livemode, false); assert.equal(method.metadata?.[marker], runId);
            await stripe.paymentMethods.attach(method.id, { customer: customerId }, { idempotencyKey: `credit-attach:${runId}` });
            await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: method.id } },
                { idempotencyKey: `credit-default-method:${runId}` });
            const payOwnedInvoice = async (id: string, label: string) => {
                await ownedCustomer();
                let invoice = await stripe.invoices.retrieve(id);
                assert.equal(invoice.livemode, false); assert.equal(stripeObjectId(invoice.customer), customerId);
                if (invoice.status !== 'paid') try {
                    invoice = await stripe.invoices.pay(id, { payment_method: method.id }, { idempotencyKey: `credit-pay:${runId}:${label}` });
                } catch (error) {
                    if (!(error instanceof Stripe.errors.StripeCardError)) throw error;
                    invoice = await stripe.invoices.retrieve(id);
                }
                if (invoice.status !== 'paid') {
                    assert.equal(invoice.status, 'open'); assert.ok(invoice.hosted_invoice_url);
                    // Use the existing normal hosted form and documented sandbox
                    // issuer approval when this account requires card verification.
                    // This never marks an invoice paid out of band or bypasses a CAPTCHA.
                    await completeHostedPayment(invoice.hosted_invoice_url, async () => {
                        const current = await stripe.invoices.retrieve(id);
                        assert.equal(current.livemode, false); assert.equal(stripeObjectId(current.customer), customerId);
                        return current.status === 'paid';
                    }, join(tmpdir(), `vosift-credit-${runId}.json`), label, false, { require3ds: true });
                    invoice = await stripe.invoices.retrieve(id);
                }
                assert.equal(invoice.status, 'paid');
                return invoice;
            };
            for (const [plan, amount] of [['Standard', 1000], ['Pro', 2000]] as const) {
                const product = await stripe.products.create({ name: `VoSift credit diagnostic ${plan}`, metadata },
                    { idempotencyKey: `credit-product:${runId}:${plan}` });
                products.push(product.id); assert.equal(product.livemode, false);
                const price = await stripe.prices.create({ product: product.id, currency: 'usd', unit_amount: amount,
                    recurring: { interval: 'month', usage_type: 'licensed' }, tax_behavior: 'exclusive', metadata },
                { idempotencyKey: `credit-price:${runId}:${plan}` });
                prices.push(price.id); assert.equal(price.livemode, false);
            }
            const subscription = await stripe.subscriptions.create({ customer: customerId, items: [{ price: prices[0], quantity: 1 }],
                billing_mode: { type: 'flexible' }, collection_method: 'charge_automatically', default_payment_method: method.id,
                payment_behavior: 'default_incomplete', automatic_tax: { enabled: false }, default_tax_rates: [], metadata },
            { idempotencyKey: `credit-subscription:${runId}` });
            subscriptionId = subscription.id;
            assert.equal(subscription.livemode, false);
            const sourceInvoiceId = stripeObjectId(subscription.latest_invoice); assert.ok(sourceInvoiceId);
            const sourceInvoice = await payOwnedInvoice(sourceInvoiceId, 'source-subscription');
            assert.equal(sourceInvoice.status, 'paid'); assert.equal(sourceInvoice.currency, 'usd');
            assert.equal(sourceInvoice.amount_paid, 1000); assert.equal(sourceInvoice.amount_remaining, 0);
            assert.equal(stripeObjectId(sourceInvoice.customer), customerId);
            assert.equal((await stripe.subscriptions.retrieve(subscriptionId)).status, 'active');

            const base = subscription.items.data[0], prorationDate = base.current_period_start;
            const context: HostedPlanInvoiceContext = { prorationDate, subscriptionId, baseItemId: base.id,
                intervalChange: false, sourcePeriodEnd: base.current_period_end };
            const params: Stripe.InvoiceCreatePreviewParams = { customer: customerId, subscription: subscriptionId,
                subscription_details: { items: [{ id: base.id, price: prices[1], quantity: 1 }], billing_cycle_anchor: { type: 'unchanged' },
                    proration_behavior: 'always_invoice', proration_date: prorationDate } };
            const raw = await stripe.invoices.createPreview(params);
            assert.equal(raw.lines.has_more, false);
            const nativeCredits = raw.lines.data.filter(line => isSourceBaseCredit(line, context));
            assert.equal(nativeCredits.length, 1);
            const sourcePrice = await stripe.prices.retrieve(invoiceLinePriceId(nativeCredits[0])!);
            const sourceBasis = hostedLineTaxBasis(nativeCredits[0], sourcePrice), unusedMinor = -sourceBasis.netAmountMinor;
            assert.equal(unusedMinor, 1000, 'The full unused Standard term receives ordinary Stripe credit.');
            const allowedMinor = unusedMinor, retainedMinor = 0;
            const frozen = await prepareHostedPlanInvoice(stripe, operationId, customerId, prices[0], prices[1], false, raw, context);
            const actualCredit = -frozen.lines.filter(line => line.role === 'credit' || line.role === 'retention')
                .reduce((sum, line) => sum + line.netAmountMinor, 0);
            assert.equal(actualCredit, allowedMinor);
            assert.equal(frozen.lines.some(line => line.role === 'retention'), false);
            const now = new Date();
            const operation = { _id: operationId, authSubject: `sandbox:${runId}`, customerId, subscriptionId, state: 'applying', kind: 'plan_change',
                sourceFingerprint: 'isolated-test-fixture', sourcePlanKey: 'standard', createdAt: now, updatedAt: now,
                expiresAt: new Date(Date.now() + 60_000), prorationDate, params: {}, paymentMode: 'hosted_invoice', hostedInvoice: frozen,
                invoiceStartedAt: now, creditPolicyVersion: NORMAL_PRORATION_POLICY_VERSION, target: { _id: new ObjectId(), key: 'pro', name: 'Sandbox Pro', stripePriceId: prices[1], price: 20,
                    currency: 'usd', interval: 'monthly', limits: { storage: 0, transcription: 0 }, features: [], isDefault: false, isActive: true,
                    createdAt: now, updatedAt: now },
                preview: { id: operationId, expiresAt: new Date(Date.now() + 60_000).toISOString(), effectiveAt: now.toISOString(), targetPlanKey: 'pro',
                    currency: 'usd', amountDueMinor: frozen.amountDueMinor, baseCreditMinor: allowedMinor, retainedCreditMinor: retainedMinor,
                    usageChargesMinor: 0, lines: [], requiresPayment: true, storageOverageConsent: false, retainedStorageBytes: 0, rates: undefined } } as unknown as BillingChangeOperation;
            const invoice = await createHostedPlanInvoice(operation, stripe, async () => {}, ownedCustomer);
            assert.equal(invoice.status, 'open'); assert.equal(invoice.total, frozen.totalMinor);
            const paid = await payOwnedInvoice(invoice.id, 'hosted-credit');
            await assertHostedPlanInvoice(operation, paid, stripe);
            assert.equal(paid.status, 'paid'); assert.equal(paid.amount_paid, frozen.amountDueMinor); assert.equal(paid.amount_remaining, 0);
            assert.equal((await stripe.subscriptions.retrieve(subscriptionId)).items.data[0].price.id, prices[0],
                'This arithmetic diagnostic does not perform application fulfillment or change the source contract.');
            t.diagnostic(JSON.stringify({ partialAcceptanceOnly: true, notLiveLaunchEvidence: true, runId, customerId,
                sourceInvoiceId, hostedInvoiceId: paid.id, verifiedPaidPrincipalMinor: 1000,
                nativeUnusedMinor: unusedMinor, creditedMinor: allowedMinor, retentionMinor: retainedMinor, paidMinor: paid.amount_paid }));
        } catch (error) { throw safeFailure(error); }
    });

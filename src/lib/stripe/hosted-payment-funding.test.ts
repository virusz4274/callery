import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { Collections } from '@/lib/mongodb';
import { hasBillingIssue } from '@/lib/access-control-common';
import { MemoryBillingDatabase, FakeBillingStripe, userFixture, planFixture, clone } from './test-support';
import { lineNetPrincipal, syncPaidInvoiceFunding } from './invoice-funding';
import { scanOutstandingInvoices, syncInvoicePaymentIssue } from './payment-issues';
import { getBillingAccount, ledgerKey } from './ledger';
import type { BillingChangeOperation } from './plan-change';
import type { HostedPlanInvoiceLine } from './plan-change-payment';

const costPolicy = { version: 'hosted-payment-funding-tests-v1', reviewedAt: '2020-01-01', expiresAt: '2099-01-01',
    paymentFeeBasisPoints: 0, paymentFixedMicros: 0, stripeBillingFeeBasisPoints: 0, stripeBillingFixedMicros: 0,
    minimumTopupMicros: 5_000_000, recoveryReserveMicros: 1, lifetimeHostingReserveMicros: 1,
    infrastructureMicrosPerAudioMinute: 0, infrastructureMicrosPerGiB: 0, aiBundleMicrosPerAudioMinute: 0,
    aiBundleFixedMicros: 0, storageCostMicrosPerGiBMonth: 0, storageOperationsMicrosPerGiBMonth: 0,
    providers: {}, ai: {}, exports: { fixedMicros: 0, perGiBMicros: 0, maximumSourceBytes: 1_000_000, recoveryReserveMicros: 1 } };
function fixture(t: TestContext, lifetime = false, retentionMinor = 0) {
    const previous = process.env.MANAGED_COST_POLICY_JSON;
    process.env.MANAGED_COST_POLICY_JSON = JSON.stringify(costPolicy);
    t.after(() => { if (previous === undefined) delete process.env.MANAGED_COST_POLICY_JSON; else process.env.MANAGED_COST_POLICY_JSON = previous; });
    const memory = new MemoryBillingDatabase(), fake = new FakeBillingStripe();
    const user = userFixture({ planKey: 'standard', stripeSubscriptionId: 'sub_source', stripeSubscriptionStatus: 'active',
        billingEntitlement: { source: 'subscription', reference: 'sub_source', grantedAt: new Date() },
        stripeMetering: { subscriptionId: 'sub_source', storagePriceId: 'price_storage', transcriptionPriceId: 'price_transcription', verifiedAt: new Date() } });
    const target = planFixture({ key: lifetime ? 'lifetime' : 'pro', stripePriceId: lifetime ? 'price_lifetime' : 'price_target', interval: lifetime ? 'lifetime' : 'monthly' });
    memory.collection(Collections.USERS).values.push(clone(user) as unknown as Record<string, unknown>);
    memory.collection(Collections.PLANS).values.push(clone(target) as unknown as Record<string, unknown>);
    const netMinor = lifetime ? 25_000 : 1_000, taxMinor = lifetime ? 5_000 : 200, feeMinor = 37;
    const frozen: HostedPlanInvoiceLine = { key: 'purchase', originalPriceId: target.stripePriceId, netAmountMinor: netMinor,
        description: 'Confirmed plan purchase', period: { start: 100, end: 200 }, taxBehavior: 'exclusive',
        taxes: [{ rateId: 'txr_confirmed', amount: taxMinor, behavior: 'exclusive' }], role: lifetime ? 'lifetime' : 'base' };
    const retention: HostedPlanInvoiceLine = { key: 'retention', netAmountMinor: retentionMinor, description: 'Consumed benefit retention',
        period: frozen.period, taxBehavior: 'exclusive', taxes: [], role: 'retention' };
    const operation = { _id: 'op_hosted', authSubject: 'owner', customerId: 'cus_owner', subscriptionId: 'sub_source',
        invoiceId: 'in_hosted', paymentMode: 'hosted_invoice', state: 'awaiting_payment', sourcePlanUsable: true,
        target, kind: lifetime ? 'lifetime_conversion' : 'plan_change', preview: { baseCreditMinor: 0 },
        hostedInvoice: { lines: retentionMinor ? [frozen, retention] : [frozen], currency: 'usd',
            totalMinor: netMinor + taxMinor + retentionMinor, amountDueMinor: netMinor + taxMinor + retentionMinor } } as BillingChangeOperation;
    memory.collection('billing_operations').values.push(clone(operation) as unknown as Record<string, unknown>);
    const line = { id: 'il_hosted', amount: netMinor, subtotal: netMinor, currency: 'usd', quantity: 1,
        period: frozen.period, discount_amounts: [], taxes: [{ amount: taxMinor, tax_behavior: 'exclusive',
            type: 'tax_rate_details', tax_rate_details: { tax_rate: 'txr_confirmed' } }],
        // Hosted invoice items use generated Stripe prices. Only the frozen
        // operation may identify which purchased base principal they represent.
        pricing: { price_details: { price: 'price_generated_invoice_item' } },
        metadata: { billingOperationId: operation._id, hostedLineKey: frozen.key, originalPriceId: target.stripePriceId, purpose: 'plan_change_payment' } } as unknown as Stripe.InvoiceLineItem;
    const retentionLine = { ...clone(line), id: 'il_retention', amount: retentionMinor, subtotal: retentionMinor, taxes: [],
        metadata: { billingOperationId: operation._id, hostedLineKey: retention.key, purpose: 'consumed_benefit_retention' } } as unknown as Stripe.InvoiceLineItem;
    const invoice = { id: 'in_hosted', customer: 'cus_owner', status: 'paid', currency: 'usd', amount_remaining: 0,
        amount_due: netMinor + taxMinor + retentionMinor, total: netMinor + taxMinor + retentionMinor, billing_reason: 'manual',
        total_taxes: [{ amount: taxMinor }], lines: { data: retentionMinor ? [line, retentionLine] : [line], has_more: false },
        metadata: { billingOperationId: operation._id, purpose: 'plan_change_payment', sourceSubscriptionId: 'sub_source' } } as unknown as Stripe.Invoice;
    fake.invoiceValues.set(invoice.id, clone(invoice));
    const api = { ...fake,
        invoicePayments: { list: () => ({ async *[Symbol.asyncIterator]() { yield { status: 'paid', amount_paid: netMinor + taxMinor + retentionMinor,
            payment: { type: 'payment_intent', payment_intent: 'pi_hosted' } }; } }) },
        paymentIntents: { retrieve: async () => ({ id: 'pi_hosted', status: 'succeeded', customer: 'cus_owner', currency: 'usd', amount_received: netMinor + taxMinor + retentionMinor,
            latest_charge: { id: 'ch_hosted', paid: true, refunded: false, disputed: false, balance_transaction: { currency: 'usd', fee: feeMinor } } }) },
    } as unknown as Stripe;
    return { memory, fake, invoice, operation, netMinor, feeMinor, deps: { db: memory.asDb(), stripe: api } };
}

for (const lifetime of [false, true]) test(`a confirmed hosted ${lifetime ? 'Lifetime' : 'recurring'} payment funds net principal and actual fees exactly once`, async t => {
    const { memory, deps, invoice, netMinor, feeMinor } = fixture(t, lifetime);
    await syncPaidInvoiceFunding(invoice.id, deps);
    await syncPaidInvoiceFunding(invoice.id, deps);
    const account = getBillingAccount(memory.user()), lots = Object.values(account.fundingLots);
    assert.equal(lots.length, 1);
    assert.equal(lots[0].kind, lifetime ? 'lifetime' : 'base');
    assert.equal(lots[0].amountMicros, netMinor * 10_000);
    assert.equal(lots[0].processorFeeMicros, feeMinor * 10_000);
    assert.equal(account.recognizedRevenueMicros, netMinor * 10_000);
    assert.equal(account.recognizedCostMicros, feeMinor * 10_000);
    assert.equal(lots[0].reference, invoice.id);
    assert.equal(account.prepaidFundedMicros, 0, 'Base payment must never mint spendable usage credit');
});

test('fresh template bindings cannot turn an unpriced recurring retention adjustment into Lifetime funding', async t => {
    const retentionMinor = 300;
    const { memory, deps, invoice, netMinor } = fixture(t, false, retentionMinor);
    process.env.MANAGED_COST_POLICY_JSON = JSON.stringify({ ...costPolicy, lifetimeHostingReserveMicros: 100_000_000 });
    for (const stripePriceId of [undefined, null, '', ' ', 'price_', 'not-a-price', 123]) {
        for (const interval of ['monthly', 'lifetime'] as const) {
            const plan = planFixture({ key: `unbound-${interval}-${String(stripePriceId)}`, interval });
            memory.collection(Collections.PLANS).values.push({ ...clone(plan), stripePriceId });
            memory.collection('billing_catalog_versions').values.push({ plan: { ...clone(plan), stripePriceId } });
        }
    }
    await syncPaidInvoiceFunding(invoice.id, deps);
    await syncPaidInvoiceFunding(invoice.id, deps);
    const account = getBillingAccount(memory.user()), lots = Object.values(account.fundingLots);
    assert.equal(lots.length, 1);
    assert.equal(lots[0].kind, 'base', 'The verified recurring purchase determines the funding role');
    assert.equal(lots[0].amountMicros, (netMinor + retentionMinor) * 10_000, 'Retained cash is attributed once');
    assert.equal(account.recognizedRevenueMicros, (netMinor + retentionMinor) * 10_000);
    assert.equal(lots[0].protectedOperatingCostMicros, undefined,
        'New payment principal is recorded without provider-expense or hosting reserves');
    assert.equal(account.prepaidFundedMicros, 0);
});

test('unbound or malformed plan bindings never establish an ordinary invoice purchase', async t => {
    const { memory, fake, deps, invoice } = fixture(t);
    memory.collection('billing_operations').values = [];
    const unpriced = fake.invoiceValues.get(invoice.id)!;
    unpriced.metadata = {};
    const priceId = 'malformed-binding';
    unpriced.lines.data[0].pricing!.price_details!.price = priceId;
    memory.collection(Collections.PLANS).values = [{ ...planFixture(), stripePriceId: priceId },
        { ...planFixture({ interval: 'lifetime' }), stripePriceId: '' }];
    await syncPaidInvoiceFunding(invoice.id, deps);
    unpriced.lines.data[0].pricing = null;
    await syncPaidInvoiceFunding(invoice.id, deps);
    assert.equal(memory.user().billingAccount, undefined);
});

test('hosted metadata without an owned operation cannot create funding', async t => {
    const { memory, fake, deps, invoice } = fixture(t);
    memory.collection('billing_operations').values = [];
    await assert.rejects(syncPaidInvoiceFunding(invoice.id, deps), /no owned operation proof/);
    assert.equal(memory.user().billingAccount, undefined);
    // Attaching retail-looking metadata to an ordinary generated item is also
    // insufficient when no hosted operation is being fulfilled.
    fake.invoiceValues.get(invoice.id)!.metadata = {};
    await syncPaidInvoiceFunding(invoice.id, deps);
    assert.equal(memory.user().billingAccount, undefined);
});

test('a forged original price or invoice owner cannot replace the frozen hosted purchase proof', async t => {
    const { memory, fake, deps, invoice } = fixture(t);
    fake.invoiceValues.get(invoice.id)!.lines.data[0].metadata.originalPriceId = 'price_lifetime';
    await assert.rejects(syncPaidInvoiceFunding(invoice.id, deps), /differs from the confirmed/);
    assert.equal(memory.user().billingAccount, undefined);
    fake.invoiceValues.set(invoice.id, clone(invoice));
    memory.collection('billing_operations').values[0].customerId = 'cus_somebody_else';
    await assert.rejects(syncPaidInvoiceFunding(invoice.id, deps), /no owned operation proof/);
    assert.equal(memory.user().billingAccount, undefined);
});

test('principal subtracts discounts once and excludes only taxes embedded in historical fallback amounts', () => {
    const tax = (tax_behavior: 'inclusive' | 'exclusive') => ({ amount: 200, tax_behavior });
    const cases = [
        { subtotal: 1000, amount: 1200, taxes: [tax('inclusive')] },
        { subtotal: 1000, amount: 1000, taxes: [tax('exclusive')] },
        { amount: 1200, taxes: [tax('inclusive')] },
        { amount: 1000, taxes: [tax('exclusive')] },
    ];
    for (const line of cases) assert.equal(lineNetPrincipal({ ...line, discount_amounts: [{ amount: 100 }] } as Stripe.InvoiceLineItem), 900);
    assert.equal(lineNetPrincipal({ amount: -100, subtotal: -100, discount_amounts: [] } as unknown as Stripe.InvoiceLineItem), 0);
});

test('an exact unpaid hosted offer preserves old-plan access, while unrelated unpaid invoices remain debt', async t => {
    const { memory, fake, deps, invoice, operation } = fixture(t);
    const optional = fake.invoiceValues.get(invoice.id)!;
    optional.status = 'open'; optional.amount_remaining = optional.amount_due;
    memory.user().billingOperation = { id: operation._id, kind: 'plan_change', state: 'awaiting_payment', targetPlanKey: 'pro', amountDueMinor: optional.amount_due,
        currency: 'usd', createdAt: new Date(), updatedAt: new Date(), sourcePlanUsable: true };
    memory.user().stripePaymentIssues = { [invoice.id]: { state: 'failed', subscriptionId: 'standalone', updatedAt: new Date() } };
    await syncInvoicePaymentIssue(invoice.id, 'failed', deps);
    assert.deepEqual(memory.user().stripePaymentIssues, {});
    assert.equal(hasBillingIssue(memory.user()), null);
    fake.invoiceValues.set('in_real_usage', { id: 'in_real_usage', customer: 'cus_owner', status: 'open', amount_remaining: 300,
        parent: { subscription_details: { subscription: 'sub_previous' } } } as Stripe.Invoice);
    await scanOutstandingInvoices('owner', deps);
    assert.deepEqual(Object.keys(memory.user().stripePaymentIssues || {}), ['in_real_usage']);
    assert.equal(memory.user().stripePaymentIssues?.in_real_usage.subscriptionId, 'sub_previous');
    assert.equal(hasBillingIssue(memory.user())?.allowed, false);
    assert.equal(memory.user().planKey, 'standard');
});

test('forged optional-invoice metadata cannot conceal real debt without an owned purchase operation', async t => {
    const { memory, fake, deps, invoice } = fixture(t);
    memory.collection('billing_operations').values = [];
    fake.invoiceValues.get(invoice.id)!.status = 'open';
    fake.invoiceValues.get(invoice.id)!.amount_remaining = invoice.amount_due;
    await syncInvoicePaymentIssue(invoice.id, 'reconcile', deps);
    assert.equal(memory.user().stripePaymentIssues?.[invoice.id].subscriptionId, 'standalone');
});

for (const consumed of ['remoteStartedAt', 'appliedAt'] as const) test(`a hosted operation with ${consumed} cannot exempt its unpaid invoice from debt`, async t => {
    const { memory, fake, deps, invoice } = fixture(t);
    const operation = memory.collection('billing_operations').values[0];
    operation[consumed] = new Date();
    if (consumed === 'appliedAt') operation.state = 'applied';
    fake.invoiceValues.get(invoice.id)!.status = 'open';
    fake.invoiceValues.get(invoice.id)!.amount_remaining = invoice.amount_due;
    await syncInvoicePaymentIssue(invoice.id, 'reconcile', deps);
    assert.ok(memory.user().stripePaymentIssues?.[invoice.id]);
    assert.equal(memory.user().billingAccount?.fundingLots[ledgerKey(`stripe-invoice:${invoice.id}`)], undefined);
});

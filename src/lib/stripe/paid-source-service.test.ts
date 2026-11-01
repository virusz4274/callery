import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { Collections } from '@/lib/mongodb';
import { clone, FakeBillingStripe, MemoryBillingDatabase, planFixture, userFixture } from './test-support';
import { getBillingAccount, ledgerKey, type FundingLot } from './ledger';
import type { BillingChangeOperation } from './plan-change';
import type { HostedPlanInvoiceLine } from './plan-change-payment';
import { previewPaidSourceServiceCredit } from './paid-source-service';

const policy = { version: 'paid-source-tests', reviewedAt: '2020-01-01', expiresAt: '2099-01-01', paymentFeeBasisPoints: 0,
    paymentFixedMicros: 0, minimumTopupMicros: 5_000_000, recoveryReserveMicros: 1, lifetimeHostingReserveMicros: 1,
    infrastructureMicrosPerAudioMinute: 0, infrastructureMicrosPerGiB: 0, aiBundleMicrosPerAudioMinute: 0, aiBundleFixedMicros: 0,
    storageCostMicrosPerGiBMonth: 0, storageOperationsMicrosPerGiBMonth: 0, providers: {}, ai: {},
    exports: { fixedMicros: 0, perGiBMicros: 0, maximumSourceBytes: 1, recoveryReserveMicros: 1 } };

function fixture(t: TestContext, tax: 'none' | 'inclusive' | 'exclusive' = 'none', redeemedMinor = 0) {
    const before = process.env.MANAGED_COST_POLICY_JSON;
    process.env.MANAGED_COST_POLICY_JSON = JSON.stringify(policy);
    t.after(() => { if (before === undefined) delete process.env.MANAGED_COST_POLICY_JSON; else process.env.MANAGED_COST_POLICY_JSON = before; });
    const db = new MemoryBillingDatabase(), fake = new FakeBillingStripe();
    const price = { ...clone(fake.priceValues.get('price_base')!), id: 'price_pro', product: 'prod_pro', unit_amount: 2000 } as Stripe.Price;
    fake.priceValues.set(price.id, price);
    const base = { id: 'si_base', price, quantity: 1, current_period_start: 1000, current_period_end: 2000 } as Stripe.SubscriptionItem;
    const subscription = fake.subscription('sub_owner'); subscription.items.data.unshift(base); subscription.latest_invoice = 'in_initial';
    const user = userFixture({ planKey: 'pro', stripePriceId: price.id, stripeSubscriptionId: subscription.id,
        billingEntitlement: { source: 'subscription', reference: subscription.id, grantedAt: new Date() }, billingLastAppliedOperationId: 'op_pro' });
    db.collection(Collections.USERS).values.push(clone(user) as never);
    const target = planFixture({ key: 'pro', stripePriceId: price.id });
    db.collection(Collections.PLANS).values.push(clone(target) as never);
    const source: HostedPlanInvoiceLine = { key: 'base', originalPriceId: price.id, role: 'base', netAmountMinor: 1600,
        period: { start: 1200, end: 2000 }, description: 'Paid Pro service', taxBehavior: tax === 'none' ? 'exclusive' : tax,
        taxes: tax === 'none' ? [] : [{ rateId: 'txr_original', amount: 320, behavior: tax }] };
    const total = 1600 + (tax === 'none' ? 0 : 320), cash = Math.max(0, total - redeemedMinor);
    const operation = { _id: 'op_pro', authSubject: 'owner', customerId: 'cus_owner', subscriptionId: subscription.id,
        state: 'applied', kind: 'plan_change', paymentMode: 'hosted_invoice', target, params: { items: [{ id: base.id, price: price.id }] },
        invoiceId: 'in_pro', preview: { baseCreditMinor: redeemedMinor }, hostedInvoice: { lines: [source], currency: 'usd', totalMinor: total, amountDueMinor: cash } } as BillingChangeOperation;
    db.collection('billing_operations').values.push(clone(operation) as never);
    const invoice = { id: 'in_pro', customer: 'cus_owner', status: 'paid', currency: 'usd', amount_remaining: 0, amount_paid: cash,
        amount_due: cash, total, billing_reason: 'manual', total_taxes: tax === 'none' ? [] : [{ amount: 320 }],
        metadata: { billingOperationId: operation._id, purpose: 'plan_change_payment', sourceSubscriptionId: subscription.id },
        lines: { has_more: false, data: [{ id: 'il_pro', amount: tax === 'inclusive' ? total : 1600, subtotal: 1600, currency: 'usd',
            period: source.period, quantity: 1, discount_amounts: [], taxes: source.taxes.map(value => ({ amount: value.amount,
                tax_behavior: value.behavior, tax_rate_details: { tax_rate: value.rateId } })),
            metadata: { billingOperationId: operation._id, hostedLineKey: source.key, originalPriceId: price.id, purpose: 'plan_change_payment' } }] } } as unknown as Stripe.Invoice;
    fake.invoiceValues.set(invoice.id, invoice);
    fake.invoiceValues.set('in_initial', { id: 'in_initial', customer: 'cus_owner', status: 'paid', currency: 'usd',
        amount_remaining: 0, billing_reason: 'subscription_create' } as Stripe.Invoice);
    const charges = new Map<string, { refunded: boolean; disputed: boolean; amount_refunded: number }>([
        [invoice.id, { refunded: false, disputed: false, amount_refunded: 0 }], ['in_ancestor', { refunded: false, disputed: false, amount_refunded: 0 }],
    ]);
    const payments = new Map([[invoice.id, cash], ['in_ancestor', redeemedMinor]]);
    if (redeemedMinor) {
        const account = getBillingAccount(db.user()), id = 'stripe-invoice:in_ancestor';
        account.fundingLots[ledgerKey(id)] = { id, reference: 'in_ancestor', kind: 'base', source: 'stripe', amountMicros: redeemedMinor * 10_000,
            creditedMicros: 0, costMicros: 0, reservedCostMicros: 0, createdAt: new Date() };
        account.planCreditReservations = { [ledgerKey(operation._id)]: { id: operation._id, state: 'applied', amountMicros: redeemedMinor * 10_000,
            allocations: { [ledgerKey(id)]: redeemedMinor * 10_000 }, redeemedMicros: redeemedMinor * 10_000,
            redeemedAllocations: { [ledgerKey(id)]: redeemedMinor * 10_000 }, redemptionReceipts: { [ledgerKey(invoice.id)]: redeemedMinor * 10_000 } } };
        db.user().billingAccount = account;
        fake.invoiceValues.set('in_ancestor', { id: 'in_ancestor', status: 'paid', customer: 'cus_owner', currency: 'usd', amount_remaining: 0 } as Stripe.Invoice);
    }
    const previews: Stripe.InvoiceCreatePreviewParams[] = [];
    const state = { corruptPreview: false };
    const api = Object.assign(fake, {
        invoicePayments: { list: ({ invoice: id }: { invoice: string }) => ({ async *[Symbol.asyncIterator]() {
            const amount = payments.get(id) || 0;
            if (amount) yield { invoice: id, status: 'paid', currency: 'usd', amount_paid: amount,
                payment: { type: 'payment_intent', payment_intent: `pi_${id}` } } as Stripe.InvoicePayment;
        } }) },
        paymentIntents: { retrieve: async (id: string) => {
            const inv = id.slice(3), amount = payments.get(inv) || 0;
            return { id, status: 'succeeded', customer: 'cus_owner', currency: 'usd', amount_received: amount,
                latest_charge: { paid: true, ...charges.get(inv), balance_transaction: { currency: 'usd', fee: 0 } } };
        } },
    });
    Object.assign(api.invoices, { createPreview: async (params: Stripe.InvoiceCreatePreviewParams) => {
        previews.push(JSON.parse(JSON.stringify(params)) as Stripe.InvoiceCreatePreviewParams);
        const item = params.invoice_items![0], quantity = Number(String(item.quantity_decimal)), amount = Math.round(item.unit_amount! * quantity);
        const net = tax === 'inclusive' ? Math.round(amount / 1.2) : amount;
        const line = { id: 'il_credit', currency: 'usd', amount, subtotal: net, period: item.period, quantity_decimal: String(item.quantity_decimal),
            metadata: state.corruptPreview ? {} : item.metadata, discount_amounts: [],
            taxes: tax === 'none' ? [] : [{ amount: tax === 'inclusive' ? amount - net : Math.round(net * .2),
                tax_behavior: tax, tax_rate_details: { tax_rate: 'txr_original' } }] };
        const zero = { id: 'il_zero', parent: { type: 'subscription_item_details', subscription_item_details: { proration: false } },
            pricing: { price_details: { product: 'prod_pro' }, unit_amount_decimal: '0' }, amount: 0, subtotal: 0, quantity: 1,
            currency: 'usd', metadata: {}, taxes: [], discount_amounts: [] };
        return { currency: 'usd', customer: 'cus_owner', lines: { data: [line, zero], has_more: false } } as unknown as Stripe.Invoice;
    } });
    const runtime = { db: db.asDb(), stripe: api.asStripe() };
    const run = (at = 1600) => previewPaidSourceServiceCredit(clone(db.user()), subscription, base, 'op_next', at, runtime);
    return { db, fake, base, subscription, source, operation, invoice, charges, payments, previews, state, run };
}

for (const tax of ['none', 'inclusive', 'exclusive'] as const) test(`paid hosted service yields a Stripe-priced unused fraction with ${tax} tax`, async t => {
    const f = fixture(t, tax), result = await f.run();
    assert.ok(result); assert.equal(result.unusedMinor, 800); assert.equal(result.basis.quantityDecimal, '0.500000000000');
    assert.equal(result.basis.invoiceId, 'in_pro'); assert.equal(result.basis.operationId, 'op_pro');
    assert.equal(f.previews[0].invoice_items![0].unit_amount, tax === 'inclusive' ? -1920 : -1600);
    assert.equal(f.previews[0].invoice_items![0].discounts, ''); assert.equal(f.previews[0].invoice_items![0].discountable, false);
    assert.equal(Object.values(getBillingAccount(f.db.user()).fundingLots).length, 1, 'the real payment is recovered once');
    await f.run(); assert.equal(Object.values(getBillingAccount(f.db.user()).fundingLots).length, 1);
});

test('paid service retains its discounted amount instead of current catalog price', async t => {
    const f = fixture(t); f.base.price.unit_amount = 9000;
    assert.equal((await f.run())!.unusedMinor, 800); assert.equal(f.previews[0].invoice_items![0].unit_amount, -1600);
});

test('cash and redeemed principal together fund the source without creating replacement revenue', async t => {
    const f = fixture(t, 'none', 1000); assert.equal((await f.run())!.unusedMinor, 800);
    const lots = Object.values(getBillingAccount(f.db.user()).fundingLots);
    assert.equal(lots.length, 2); assert.equal(lots.reduce((sum, lot) => sum + lot.amountMicros, 0), 16_000_000);
});

test('a valid zero-balance credit-funded purchase can supply source service', async t => {
    const f = fixture(t, 'none', 1600); assert.equal(f.invoice.amount_due, 0);
    assert.equal((await f.run())!.unusedMinor, 800);
    assert.equal(Object.values(getBillingAccount(f.db.user()).fundingLots).length, 1);
});

test('no applied hosted history leaves ordinary native proration unchanged', async t => {
    const f = fixture(t); delete f.db.user().billingLastAppliedOperationId;
    f.db.collection('billing_operations').values.length = 0;
    assert.equal(await f.run(), null); assert.equal(f.previews.length, 0);
});

test('owned applied history is recovered without a stored marker or manual profile changes', async t => {
    const f = fixture(t); delete f.db.user().billingLastAppliedOperationId;
    assert.equal((await f.run())!.unusedMinor, 800);
    assert.equal(f.db.user().billingLastAppliedOperationId, undefined);
});

test('ambiguous unmarked hosted history fails instead of silently falling back to native credit', async t => {
    const f = fixture(t); delete f.db.user().billingLastAppliedOperationId;
    f.db.collection('billing_operations').values.push({ ...clone(f.operation), _id: 'op_duplicate' } as never);
    await assert.rejects(f.run(), /latest hosted purchase/); assert.equal(f.previews.length, 0);
});

test('older banked credits and the current inline credit jointly preserve their original cash lineage', async t => {
    const f = fixture(t, 'none', 1000), account = f.db.user().billingAccount!;
    const current = account.planCreditReservations![ledgerKey('op_pro')], ancestor = Object.keys(account.fundingLots)[0];
    current.amountMicros = 5_000_000; current.redeemedMicros = 5_000_000;
    current.allocations[ancestor] = 5_000_000; current.redeemedAllocations![ancestor] = 5_000_000;
    current.redemptionReceipts![ledgerKey('in_pro')] = 5_000_000;
    account.planCreditReservations![ledgerKey('op_older')] = { ...clone(current), id: 'op_older' };
    (f.db.collection('billing_operations').values[0] as unknown as BillingChangeOperation).preview.baseCreditMinor = 500;
    assert.equal((await f.run())!.unusedMinor, 800);
    assert.equal(Object.values(getBillingAccount(f.db.user()).fundingLots).reduce((sum, lot) => sum + lot.amountMicros, 0), 16_000_000);
});

for (const creditFunded of [false, true]) test(`a proved ${creditFunded ? 'credit-funded' : 'cash-paid'} renewal supersedes expired hosted service`, async t => {
    const f = fixture(t); f.base.current_period_start = 2000; f.base.current_period_end = 3000;
    f.subscription.latest_invoice = 'in_renewal';
    f.fake.invoiceValues.set('in_renewal', { id: 'in_renewal', customer: 'cus_owner', status: 'paid', currency: 'usd', billing_reason: 'subscription_cycle',
        total: 2000, amount_paid: creditFunded ? 0 : 2000, amount_due: creditFunded ? 0 : 2000, amount_remaining: 0,
        parent: { subscription_details: { subscription: f.subscription.id } }, lines: { has_more: false, data: [{ amount: 2000,
            currency: 'usd', quantity: 1, period: { start: 2000, end: 3000 }, pricing: { price_details: { price: f.base.price.id } },
            parent: { type: 'subscription_item_details', subscription_item_details: { subscription: f.subscription.id, subscription_item: f.base.id, proration: false } } }] } } as unknown as Stripe.Invoice);
    assert.equal(await f.run(2400), null); assert.equal(f.previews.length, 0);
});

test('a paid-status renewal rolled into positive customer debt cannot replace funded source proof', async t => {
    const f = fixture(t); f.subscription.latest_invoice = 'in_rolled_renewal';
    f.fake.invoiceValues.set('in_rolled_renewal', { id: 'in_rolled_renewal', customer: 'cus_owner', status: 'paid', currency: 'usd',
        billing_reason: 'subscription_cycle', total: 1, amount_paid: 0, amount_due: 1, amount_remaining: 0 } as Stripe.Invoice);
    await assert.rejects(f.run(), /renewal payment was deferred to customer debt/); assert.equal(f.previews.length, 0);
});

test('missing, foreign or ambiguous referenced history fails closed', async t => {
    for (const kind of ['missing', 'foreign', 'unapplied', 'wrong-item', 'duplicate-base'] as const) {
        const f = fixture(t), op = f.db.collection('billing_operations').values[0] as unknown as BillingChangeOperation;
        if (kind === 'missing') f.db.collection('billing_operations').values.length = 0;
        if (kind === 'foreign') op.customerId = 'cus_foreign';
        if (kind === 'unapplied') op.state = 'awaiting_payment';
        if (kind === 'wrong-item') op.params.items![0].id = 'si_other';
        if (kind === 'duplicate-base') op.hostedInvoice!.lines.push(clone(f.source));
        await assert.rejects(f.run(), /reconciliation/, kind); assert.equal(f.previews.length, 0);
    }
});

test('unpaid, changed or credit-noted source invoices cannot establish service credit', async t => {
    for (const kind of ['unpaid', 'line-changed', 'credit-note'] as const) {
        const f = fixture(t);
        if (kind === 'unpaid') f.invoice.status = 'open';
        if (kind === 'line-changed') f.invoice.lines.data[0].subtotal = 1599;
        if (kind === 'credit-note') f.invoice.post_payment_credit_notes_amount = 1;
        await assert.rejects(f.run(), error => error instanceof Error, kind); assert.equal(f.previews.length, 0);
    }
});

test('positive paid invoices rolled into a customer debit have no invented funding', async t => {
    const f = fixture(t); f.payments.set('in_pro', 0); f.invoice.amount_paid = 0;
    await assert.rejects(f.run(), /cash and redeemed credit/); assert.equal(f.previews.length, 0);
});

test('refunded and disputed original cash is rejected even when an old additive funding lot remains', async t => {
    for (const kind of ['refunded', 'partial', 'disputed'] as const) {
        const f = fixture(t); await f.run();
        if (kind === 'refunded') f.charges.get('in_pro')!.refunded = true;
        if (kind === 'partial') f.charges.get('in_pro')!.amount_refunded = 1;
        if (kind === 'disputed') f.charges.get('in_pro')!.disputed = true;
        await assert.rejects(f.run(), /refunded, disputed/); assert.equal(f.previews.length, 1);
    }
});

test('credit-funded ancestors retain original refund and reversal checks', async t => {
    const f = fixture(t, 'none', 1600); f.charges.get('in_ancestor')!.amount_refunded = 1;
    await assert.rejects(f.run(), /refunded, disputed/); assert.equal(f.previews.length, 0);
    f.charges.get('in_ancestor')!.amount_refunded = 0;
    const ancestor = Object.values(f.db.user().billingAccount!.fundingLots)[0] as FundingLot;
    ancestor.reversalReceipts = ['refund']; await assert.rejects(f.run(), /lineage/);
});

test('expired purchased periods and unauthenticated preview lines never produce credit', async t => {
    const f = fixture(t); await assert.rejects(f.run(2000), /period/);
    f.state.corruptPreview = true; await assert.rejects(f.run(), /reproduce/);
});

test('fractional seconds use a bounded decimal quantity and Stripe owns rounding', async t => {
    const f = fixture(t); const result = await f.run(1999);
    assert.equal(result!.basis.quantityDecimal, '0.001250000000'); assert.equal(result!.unusedMinor, 2);
});

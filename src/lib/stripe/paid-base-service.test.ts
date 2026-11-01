import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { assertCurrentBasePeriodPaid } from './paid-base-service';
import { BillingSyncPendingError } from './billing-errors';
import { MemoryBillingDatabase, FakeBillingStripe, userFixture, clone } from './test-support';

function fixture(annual = false) {
    const memory = new MemoryBillingDatabase(), stripe = new FakeBillingStripe(), subscription = stripe.subscription('sub_owner');
    const start = Math.floor(Date.parse('2026-10-01') / 1000), end = Math.floor(Date.parse(annual ? '2027-10-01' : '2026-11-01') / 1000);
    const base = { id: 'si_base', price: { ...stripe.priceValues.get('price_base'), recurring: { usage_type: 'licensed', interval: annual ? 'year' : 'month', interval_count: 1 } },
        quantity: 1, current_period_start: start, current_period_end: end } as Stripe.SubscriptionItem;
    subscription.items.data.unshift(base); subscription.latest_invoice = 'in_base'; subscription.currency = 'usd'; stripe.subscriptionValues.push(subscription);
    const invoice = { id: 'in_base', customer: 'cus_owner', currency: 'usd', status: 'paid', amount_paid: 1000, amount_due: 1000, amount_remaining: 0,
        parent: { subscription_details: { subscription: subscription.id } }, lines: { data: [{ id: 'il_base', amount: 1000, currency: 'usd', quantity: 1,
            period: { start, end }, pricing: { price_details: { price: base.price.id } },
            parent: { type: 'subscription_item_details', subscription_item_details: { subscription: subscription.id, subscription_item: base.id, proration: false } } }], has_more: false } } as unknown as Stripe.Invoice;
    stripe.invoiceValues.set(invoice.id, invoice);
    const user = userFixture({ stripePriceId: base.price.id, stripeSubscriptionId: subscription.id, billingEntitlement: { source: 'subscription', reference: subscription.id, grantedAt: new Date() }, billingPaidBasePeriod: undefined });
    memory.collection('users').values.push(user as never);
    const charge = { paid: true, refunded: false, disputed: false, amount_refunded: 0 };
    let payments = 0;
    Object.assign(stripe, { invoicePayments: { list: () => ({ async *[Symbol.asyncIterator]() {
        payments++; yield { invoice: invoice.id, currency: 'usd', status: 'paid', amount_paid: 1000, payment: { type: 'payment_intent', payment_intent: 'pi_base' } };
    } }) } });
    Object.assign(stripe.paymentIntents, { retrieve: async () => ({ id: 'pi_base', customer: 'cus_owner', currency: 'usd', status: 'succeeded', amount_received: 1000, latest_charge: clone(charge) }) });
    const runtime = { db: memory.asDb(), stripe: stripe.asStripe() };
    return { user, stripe, memory, subscription, base, invoice, charge, runtime, payments: () => payments,
        verify: () => assertCurrentBasePeriodPaid(subscription, user, runtime) };
}

test('a verified paid base invoice supplies service proof without any provider-cost policy or fee settlement', async () => {
    const value = fixture(), proof = await value.verify(); assert.ok(proof);
    assert.equal(proof.basePriceId, value.base.price.id); assert.equal(proof.invoiceId, value.invoice.id);
    assert.equal(proof.start.toISOString(), '2026-10-01T00:00:00.000Z'); assert.equal(proof.end.toISOString(), '2026-11-01T00:00:00.000Z');
});
test('an active subscription with a draft or unpaid renewal does not establish paid service', async () => {
    for (const state of ['draft', 'open', 'void', 'uncollectible'] as const) {
        const value = fixture(); Object.assign(value.invoice, { status: state, amount_paid: 0, amount_remaining: 1000 });
        await assert.rejects(value.verify(), BillingSyncPendingError);
    }
});
test('Stripe-confirmed discount or credit-funded zero-balance invoices establish paid service', async () => {
    const value = fixture(); Object.assign(value.invoice, { amount_due: 0, amount_paid: 0, amount_remaining: 0 });
    assert.equal((await value.verify())!.invoiceId, value.invoice.id); assert.equal(value.payments(), 0);
});
test('paid-status debt rollover, unverified cash and reversed payments cannot grant a new allowance', async () => {
    const debt = fixture(); debt.invoice.amount_paid = 0;
    await assert.rejects(debt.verify(), BillingSyncPendingError);
    for (const reversal of ['refund', 'partial', 'dispute']) {
        const value = fixture();
        if (reversal === 'refund') value.charge.refunded = true;
        if (reversal === 'partial') value.charge.amount_refunded = 1;
        if (reversal === 'dispute') value.charge.disputed = true;
        await assert.rejects(value.verify(), /reversed or remains unverified/);
    }
});
test('annual paid base proof covers its actual year independently of monthly usage dates', async () => {
    const value = fixture(true); value.user.stripeCurrentPeriodStart = new Date('2026-10-22'); value.user.stripeCurrentPeriodEnd = new Date('2026-11-22');
    assert.equal((await value.verify())!.end.toISOString(), '2027-10-01T00:00:00.000Z');
    value.base.current_period_start = Math.floor(Date.parse('2027-10-01') / 1000); value.base.current_period_end = Math.floor(Date.parse('2028-10-01') / 1000);
    value.user.billingPaidBasePeriod = { customerId: 'cus_owner', customerGeneration: 0, subscriptionId: value.subscription.id, basePriceId: value.base.price.id,
        start: new Date('2026-10-01'), end: new Date('2027-10-01'), invoiceId: value.invoice.id };
    await assert.rejects(value.verify(), BillingSyncPendingError);
});
test('paid service cache requires matching customer generation, subscription and base Price', async () => {
    const value = fixture(), proof = await value.verify(); value.user.billingPaidBasePeriod = proof;
    await value.verify(); assert.equal(value.payments(), 1, 'Matching cached proof avoids per-job Stripe payment scans');
    value.user.stripeCustomerGeneration = 1; await value.verify(); assert.equal(value.payments(), 2);
});
test('an unrelated usage invoice cannot stand in for the current unpaid base renewal', async () => {
    const value = fixture(); value.invoice.lines.data[0].pricing!.price_details!.price = 'price_storage';
    await assert.rejects(value.verify(), BillingSyncPendingError);
});
test('unreconciled credit-note adjustments remain a financial hold rather than invented paid principal', async () => {
    const value = fixture(); value.invoice.post_payment_credit_notes_amount = 100;
    await assert.rejects(value.verify(), BillingSyncPendingError);
});

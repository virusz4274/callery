import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import type { BillingChangeOperation } from './plan-change';
import { assertHostedPlanInvoice, hostedInvoiceItems, prepareHostedPlanInvoice, previewRetentionPrincipal, isSourceBaseCredit, type HostedPlanInvoiceContext } from './plan-change-payment';

function fixture(behavior: 'inclusive' | 'exclusive') {
    let supplied: Stripe.InvoiceCreatePreviewParams.InvoiceItem[] = [];
    const tax = (amount: number) => ({ amount, tax_behavior: behavior, type: 'tax_rate_details', tax_rate_details: { tax_rate: 'txr_audited' } });
    const line = (price: string, subtotal: number, discount: number, taxAmount: number, key?: string) => ({ id: `il_${price}`,
        amount: subtotal - discount, subtotal, currency: 'usd', quantity: 1, description: price, period: { start: 100, end: 200 },
        discount_amounts: discount ? [{ amount: discount, discount: 'di_existing' }] : [], taxes: [tax(taxAmount)],
        parent: { type: 'subscription_item_details', subscription_item_details: { proration: true, subscription: 'sub_source', subscription_item: 'si_base' } },
        pricing: { price_details: { price } }, metadata: key === undefined ? {} : { billingOperationId: 'op', hostedLineKey: key,
            originalPriceId: price, purpose: 'plan_change_payment' } }) as unknown as Stripe.InvoiceLineItem;
    const preview = (items: Stripe.InvoiceCreatePreviewParams.InvoiceItem[]) => {
        supplied = items;
        const lines = items.map(item => {
            const amount = item.amount!, subtotal = behavior === 'inclusive' ? Math.round(amount / 1.2) : amount;
            const result = line((item.metadata as Record<string, string>).originalPriceId, subtotal, 0, Math.round(subtotal / 5));
            result.metadata = item.metadata as Record<string, string>; return result;
        });
        const total = lines.reduce((sum, row) => sum + row.subtotal + row.taxes![0].amount, 0);
        return { id: 'in_preview', customer: 'cus_owner', currency: 'usd', total, amount_due: total, lines: { data: lines, has_more: false } } as Stripe.Invoice;
    };
    const stripe = { prices: { retrieve: async () => ({ tax_behavior: behavior, product: 'prod_source' }) }, invoices: { createPreview: async (params: Stripe.InvoiceCreatePreviewParams) => {
        assert.equal(params.subscription, undefined);
        assert.equal(params.customer, 'cus_owner');
        assert.equal(params.subscription_details?.items?.[0].price_data?.unit_amount, 0);
        const result = preview(params.invoice_items || []);
        result.lines.data.push({ amount: 0, subtotal: 0, quantity: 1, currency: 'usd', metadata: {}, discount_amounts: [], taxes: [],
            pricing: { price_details: { product: 'prod_source' }, unit_amount_decimal: '0' },
            parent: { type: 'subscription_item_details', subscription_item_details: { proration: false } } } as unknown as Stripe.InvoiceLineItem);
        return result;
    } } } as unknown as Stripe;
    const source = { currency: 'usd', lines: { data: [line('price_source', -500, 0, -100), line('price_target', 1000, 100, 180),
        line('price_usage', 400, 0, 80)], has_more: false } } as Stripe.Invoice;
    return { stripe, source, supplied: () => supplied, preview };
}

for (const behavior of ['inclusive', 'exclusive'] as const) test(`hosted invoice preserves ${behavior} tax, nets discounts once and excludes metered usage`, async () => {
    const { stripe, source, supplied } = fixture(behavior);
    const frozen = await prepareHostedPlanInvoice(stripe, 'op', 'cus_owner', 'price_source', 'price_target', false, source);
    assert.equal(frozen.lines.length, 2); assert.equal(frozen.lines[1].netAmountMinor, 900);
    assert.equal(supplied()[1].amount, behavior === 'inclusive' ? 1080 : 900);
    assert.equal(supplied()[1].discountable, false); assert.equal(frozen.totalMinor, 480); assert.equal(frozen.amountDueMinor, 480);
    const items = hostedInvoiceItems('op', frozen);
    assert.equal(items.some(item => (item.metadata as Record<string, string>).originalPriceId === 'price_usage'), false);
});

test('hosted invoice proof rejects altered totals, tax, ownership or unrecognized line metadata', async () => {
    const { stripe, source, preview } = fixture('exclusive');
    const frozen = await prepareHostedPlanInvoice(stripe, 'op', 'cus_owner', 'price_source', 'price_target', false, source);
    const invoice = preview(hostedInvoiceItems('op', frozen));
    Object.assign(invoice, { id: 'in_owned', status: 'paid', metadata: { billingOperationId: 'op', purpose: 'plan_change_payment', sourceSubscriptionId: 'sub_source' } });
    const operation = { _id: 'op', invoiceId: invoice.id, customerId: 'cus_owner', subscriptionId: 'sub_source', paymentMode: 'hosted_invoice', hostedInvoice: frozen } as BillingChangeOperation;
    await assertHostedPlanInvoice(operation, invoice, stripe);
    for (const mutate of [(copy: Stripe.Invoice) => { copy.total++; }, (copy: Stripe.Invoice) => { copy.customer = 'cus_other'; },
        (copy: Stripe.Invoice) => { copy.lines.data[1].taxes![0].amount++; },
        (copy: Stripe.Invoice) => { copy.lines.data[1].metadata.hostedLineKey = 'unknown'; }]) {
        const copy = structuredClone(invoice); mutate(copy);
        await assert.rejects(assertHostedPlanInvoice(operation, copy, stripe), /confirmed|Unexpected|differs/);
    }
});

for (const behavior of ['inclusive', 'exclusive'] as const) test(`owned inline retention preserves ${behavior} tax and capped credit without retrieving a synthetic Price`, async () => {
    const { stripe, source, supplied, preview } = fixture(behavior);
    const retrieved: string[] = [];
    stripe.prices.retrieve = (async (id: string) => {
        retrieved.push(id);
        if (id === 'price_preview_inline') throw Object.assign(new Error('No such price'), { statusCode: 404, code: 'resource_missing' });
        return { id, tax_behavior: behavior, product: 'prod_source' };
    }) as Stripe['prices']['retrieve'];
    const adjustment = structuredClone(source.lines.data[1]);
    Object.assign(adjustment, { id: 'il_retention', amount: 300, subtotal: 300, description: 'Consumed benefit retention', discount_amounts: [],
        pricing: { price_details: { price: 'price_preview_inline' } }, metadata: { billingOperationId: 'op', purpose: 'consumed_benefit_retention' } });
    adjustment.taxes![0].amount = 60;
    source.lines.data.push(adjustment);
    const frozen = await prepareHostedPlanInvoice(stripe, 'op', 'cus_owner', 'price_source', 'price_target', false, source);
    assert.deepEqual(retrieved, ['price_source', 'price_target']);
    assert.equal(frozen.totalMinor, 840);
    assert.equal(frozen.amountDueMinor, 840);
    assert.deepEqual(frozen.lines[2], { key: '2', netAmountMinor: 300, description: 'Consumed benefit retention',
        period: { start: 100, end: 200 }, taxBehavior: behavior, taxes: [{ rateId: 'txr_audited', amount: 60, behavior }], role: 'retention' });
    assert.equal(supplied()[2].amount, behavior === 'inclusive' ? 360 : 300);
    assert.equal(supplied()[2].discountable, false);
    assert.equal((supplied()[2].metadata as Record<string, string>).originalPriceId, undefined, 'retention must not be attributed to catalog base principal twice');
    const invoice = preview(hostedInvoiceItems('op', frozen));
    Object.assign(invoice, { id: 'in_owned', metadata: { billingOperationId: 'op', purpose: 'plan_change_payment', sourceSubscriptionId: 'sub_source' } });
    await assertHostedPlanInvoice({ _id: 'op', invoiceId: invoice.id, customerId: 'cus_owner', subscriptionId: 'sub_source',
        paymentMode: 'hosted_invoice', hostedInvoice: frozen } as BillingChangeOperation, invoice, stripe);
});

test('unretrievable catalog source credit and target prices still fail closed', async () => {
    for (const missing of ['price_source', 'price_target']) {
        const { stripe, source } = fixture('exclusive');
        stripe.prices.retrieve = (async (id: string) => {
            if (id === missing) throw Object.assign(new Error(`No such catalog price: ${id}`), { statusCode: 404, code: 'resource_missing' });
            return { id, tax_behavior: 'exclusive', product: 'prod_source' };
        }) as Stripe['prices']['retrieve'];
        await assert.rejects(prepareHostedPlanInvoice(stripe, 'op', 'cus_owner', 'price_source', 'price_target', false, source), /No such catalog price/);
    }
});

test('retention exemption requires this operation and a positive nondiscounted adjustment', async () => {
    for (const change of ['foreign-operation', 'negative-credit', 'discounted'] as const) {
        const { stripe, source } = fixture('exclusive');
        const adjustment = structuredClone(source.lines.data[1]);
        Object.assign(adjustment, { amount: change === 'negative-credit' ? -300 : 300, subtotal: change === 'negative-credit' ? -300 : 300,
            discount_amounts: change === 'discounted' ? [{ amount: 100, discount: 'di_wrong' }] : [], pricing: { price_details: { price: 'price_preview_inline' } },
            metadata: { billingOperationId: change === 'foreign-operation' ? 'different-operation' : 'op', purpose: 'consumed_benefit_retention' } });
        source.lines.data.push(adjustment);
        if (change === 'foreign-operation') {
            const frozen = await prepareHostedPlanInvoice(stripe, 'op', 'cus_owner', 'price_source', 'price_target', false, source);
            assert.equal(frozen.lines.length, 2);
        } else await assert.rejects(prepareHostedPlanInvoice(stripe, 'op', 'cus_owner', 'price_source', 'price_target', false, source), /retention adjustment is invalid/);
    }
});

test('same-price renewal lines are excluded; only immediate prorations fund a recurring change', async () => {
    const { stripe, source } = fixture('exclusive');
    const renewal = structuredClone(source.lines.data[1]);
    Object.assign(renewal, { id: 'il_next_cycle', amount: 2000, subtotal: 2000, discount_amounts: [],
        parent: { type: 'subscription_item_details', subscription_item_details: { proration: false } } });
    source.lines.data.push(renewal);
    const frozen = await prepareHostedPlanInvoice(stripe, 'op', 'cus_owner', 'price_source', 'price_target', false, source);
    assert.deepEqual(frozen.lines.map(line => line.role), ['credit', 'base']);
    assert.equal(frozen.totalMinor, 480);
});

test('a historical billed Price credit belongs to its exact base item while other items and periods are excluded', async () => {
    const { stripe, source } = fixture('exclusive');
    const context: HostedPlanInvoiceContext = { prorationDate: 100, subscriptionId: 'sub_source', baseItemId: 'si_base', intervalChange: false, sourcePeriodEnd: 200 };
    source.lines.data[0].pricing!.price_details!.price = 'price_historical';
    assert.equal(isSourceBaseCredit(source.lines.data[0], context), true);
    const unrelated = structuredClone(source.lines.data[0]); unrelated.parent!.subscription_item_details!.subscription_item = 'si_meter';
    source.lines.data.push(unrelated);
    const future = structuredClone(source.lines.data[0]); future.period.start = 200; future.period.end = 300;
    source.lines.data.push(future);
    const frozen = await prepareHostedPlanInvoice(stripe, 'op', 'cus_owner', 'price_source', 'price_target', false, source, context);
    assert.deepEqual(frozen.lines.map(line => line.originalPriceId), ['price_historical', 'price_target']);
});

test('an owned paid-source credit replaces the native historical debit basis without retrieving its inline Price', async () => {
    const { stripe, source } = fixture('exclusive');
    const credit = structuredClone(source.lines.data[0]);
    Object.assign(credit, { amount: -1000, subtotal: -1000, parent: { type: 'invoice_item_details', invoice_item_details: { proration: false } },
        metadata: { purpose: 'paid_source_service_credit', billingOperationId: 'op', paidSourcePriceId: 'price_source' },
        pricing: { price_details: { price: 'price_ephemeral' } } });
    credit.taxes![0].amount = -200;
    source.lines.data[0] = credit;
    stripe.prices.retrieve = (async (id: string) => { assert.notEqual(id, 'price_ephemeral'); return { id, product: 'prod_source', tax_behavior: 'exclusive' }; }) as Stripe['prices']['retrieve'];
    const frozen = await prepareHostedPlanInvoice(stripe, 'op', 'cus_owner', 'price_source', 'price_target', false, source);
    assert.equal(frozen.lines[0].role, 'credit'); assert.equal(frozen.lines[0].originalPriceId, 'price_source');
    assert.equal(frozen.lines[0].netAmountMinor, -1000);
});

for (const behavior of ['inclusive', 'exclusive'] as const) test(`retention caps net principal exactly with ${behavior} tax`, async () => {
    const { stripe, supplied } = fixture(behavior);
    const amount = await previewRetentionPrincipal(stripe, 'op', 'cus_owner', 'usd', 'prod_source', 301,
        { netAmountMinor: 500, taxBehavior: behavior, taxes: [{ rateId: 'txr_audited', amount: 100, behavior }] }, 100);
    assert.equal(amount, behavior === 'inclusive' ? 361 : 301);
    assert.equal(supplied()[0].amount, amount);
});

test('verified cross-interval conversion includes one immediate full-term charge and excludes its future renewal', async () => {
    const { stripe, source } = fixture('exclusive');
    const context: HostedPlanInvoiceContext = { prorationDate: 100, subscriptionId: 'sub_source', baseItemId: 'si_base', intervalChange: true };
    stripe.prices.retrieve = (async (id: string) => ({ id, tax_behavior: 'exclusive', product: 'prod_source',
        recurring: { interval: id === 'price_source' ? 'month' : 'year', interval_count: 1 } })) as Stripe['prices']['retrieve'];
    Object.assign(source.lines.data[1], { amount: 12000, subtotal: 12000, discount_amounts: [], period: { start: 100, end: 31536100 },
        parent: { type: 'subscription_item_details', subscription_item_details: { proration: false, subscription: 'sub_source', subscription_item: 'si_base' } } });
    source.lines.data[1].taxes![0].amount = 2400;
    const renewal = structuredClone(source.lines.data[1]);
    Object.assign(renewal, { id: 'il_annual_renewal', period: { start: 31536100, end: 63072100 } });
    source.lines.data.push(renewal);
    const frozen = await prepareHostedPlanInvoice(stripe, 'op', 'cus_owner', 'price_source', 'price_target', false, source, context);
    assert.deepEqual(frozen.lines.map(line => ({ role: line.role, amount: line.netAmountMinor })), [{ role: 'credit', amount: -500 }, { role: 'base', amount: 12000 }]);
    assert.equal(frozen.totalMinor, 13800);
    assert.equal(frozen.lines.filter(line => line.originalPriceId === 'price_target').length, 1);
});

test('unverified or future full-term charges cannot be copied as an immediate interval change', async () => {
    for (const failure of ['missing-context', 'same-interval', 'not-changing', 'future-renewal', 'other-subscription', 'other-item', 'wrong-price'] as const) {
        const { stripe, source } = fixture('exclusive');
        const context: HostedPlanInvoiceContext = { prorationDate: 100, subscriptionId: 'sub_source', baseItemId: 'si_base', intervalChange: failure !== 'not-changing' };
        stripe.prices.retrieve = (async (id: string) => ({ id, tax_behavior: 'exclusive', product: 'prod_source',
            recurring: { interval: id === 'price_source' || failure === 'same-interval' ? 'month' : 'year', interval_count: 1 } })) as Stripe['prices']['retrieve'];
        Object.assign(source.lines.data[1], { period: { start: failure === 'future-renewal' ? 200 : 100, end: 31536100 },
            pricing: { price_details: { price: failure === 'wrong-price' ? 'price_unrelated' : 'price_target' } },
            parent: { type: 'subscription_item_details', subscription_item_details: { proration: false,
                subscription: failure === 'other-subscription' ? 'sub_other' : 'sub_source', subscription_item: failure === 'other-item' ? 'si_other' : 'si_base' } } });
        await assert.rejects(prepareHostedPlanInvoice(stripe, 'op', 'cus_owner', 'price_source', 'price_target', false, source,
            failure === 'missing-context' ? undefined : context), /no target base purchase/);
    }
});

test('Lifetime includes only the owned one-time purchase alongside immediate source proration', async () => {
    const { stripe, source } = fixture('exclusive');
    Object.assign(source.lines.data[1], { parent: { type: 'invoice_item_details', invoice_item_details: { proration: false } },
        metadata: { billingOperationId: 'op', purpose: 'lifetime_purchase' } });
    const frozen = await prepareHostedPlanInvoice(stripe, 'op', 'cus_owner', 'price_source', 'price_target', true, source);
    assert.deepEqual(frozen.lines.map(line => line.role), ['credit', 'lifetime']);
    source.lines.data[1].metadata.billingOperationId = 'different-operation';
    await assert.rejects(prepareHostedPlanInvoice(stripe, 'op', 'cus_owner', 'price_source', 'price_target', true, source), /no target base purchase/);
});

test('isolated preview preserves Stripe-computed amount due instead of inferring customer cash or credit', async () => {
    for (const due of [0, 1, 230, 730]) {
        const { stripe, source } = fixture('exclusive');
        const preview = stripe.invoices.createPreview.bind(stripe.invoices);
        stripe.invoices.createPreview = (async (params: Stripe.InvoiceCreatePreviewParams) => ({ ...await preview(params), amount_due: due })) as Stripe['invoices']['createPreview'];
        const frozen = await prepareHostedPlanInvoice(stripe, 'op', 'cus_owner', 'price_source', 'price_target', false, source);
        assert.equal(frozen.totalMinor, 480);
        assert.equal(frozen.amountDueMinor, due);
    }
});

test('only the exact zero preview sentinel may accompany the frozen manual invoice lines', async () => {
    const mutations: ((line: Stripe.InvoiceLineItem) => void)[] = [
        line => { line.amount = 1; }, line => { line.subtotal = 1; }, line => { line.quantity = 2; },
        line => { line.pricing!.price_details!.product = 'prod_other'; },
        line => { Object.assign(line.pricing!, { unit_amount_decimal: '1' }); },
        line => { line.parent!.subscription_item_details!.proration = true; },
        line => { line.discount_amounts = [{ amount: 1, discount: 'di_unknown' }]; },
        line => { line.taxes = [{ amount: 1, tax_behavior: 'exclusive', type: 'tax_rate_details', tax_rate_details: { tax_rate: 'txr_unknown' }, taxable_amount: 0, taxability_reason: 'standard_rated' }]; },
    ];
    for (const mutate of mutations) {
        const { stripe, source } = fixture('exclusive');
        const preview = stripe.invoices.createPreview.bind(stripe.invoices);
        stripe.invoices.createPreview = (async (params: Stripe.InvoiceCreatePreviewParams) => {
            const result = await preview(params); mutate(result.lines.data.at(-1)!); return result;
        }) as Stripe['invoices']['createPreview'];
        await assert.rejects(prepareHostedPlanInvoice(stripe, 'op', 'cus_owner', 'price_source', 'price_target', false, source), /unexpected charges/);
    }
});

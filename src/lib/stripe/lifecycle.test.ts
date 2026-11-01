import { reserveLegacyCostFixture } from './legacy-test-support';
import { testProcessingCostEvidence } from './processing-test-support';
import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { MemoryBillingDatabase, FakeBillingStripe, clone, planFixture, userFixture, seedPublishedCatalogFixture } from './test-support';
import { BILLING_CATALOG } from './catalog';
import { creditBaseFunds, getBillingAccount, ledgerKey, creditPrepaidFunds, settlePrepaidReservation, ensurePeriod } from './ledger';
import { BillingSyncPendingError } from './billing-errors';
import { refundableBaseMicros, reservePlanCredit, settlePlanCredit } from './plan-credit-economics';
import { NORMAL_PRORATION_POLICY_VERSION } from './subscription-schedule';
import { createPlanChangePreview, applyPlanChange, advancePlanChange, cancelPlanChange } from './plan-change';
import { ensureRecurringUsageBilling } from './bootstrap';
import { createUsageTopup, confirmUsageTopup, suspendPrepaidForCharge, updateAutomaticTopup } from './prepaid-topup';
import { syncPaidInvoiceFunding } from './invoice-funding';
import { processorFeeUsdMicros } from './fees';
import { REQUIRED_BILLING_CHECKS } from './launch-gate';
import { validateCheckoutPlan } from './metering';
import { syncSubscription } from './sync';
import { createOrResumeCheckout } from './checkout';
import { assertPrepaidGrantsCoverTarget } from './grant-prices';
import { hasBillingIssue } from '@/lib/access-control-common';

process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
process.env.MANAGED_COST_POLICY_JSON = JSON.stringify({ version: 'lifecycle-unit', reviewedAt: '2020-01-01', expiresAt: '2099-01-01',
    paymentFeeBasisPoints: 0, paymentFixedMicros: 0, stripeBillingFeeBasisPoints: 0, stripeBillingFixedMicros: 0, minimumTopupMicros: 5_000_000, infrastructureMicrosPerAudioMinute: 0, infrastructureMicrosPerGiB: 0,
    aiBundleMicrosPerAudioMinute: 0, aiBundleFixedMicros: 0, storageCostMicrosPerGiBMonth: 100, storageOperationsMicrosPerGiBMonth: 0,
    recoveryReserveMicros: 1, lifetimeHostingReserveMicros: 1, lifetimeUsage: { audioOverheadMicrosPerMinute: 0, recordingOverheadMicros: 0, storageOverheadMicrosPerGiBMonth: 0 },
    providers: { soniox: { costMicrosPerAudioMinute: 100, fixedMicros: 0 }, gemini: { costMicrosPerAudioMinute: 100, fixedMicros: 0 }, elevenlabs: { costMicrosPerAudioMinute: 100, fixedMicros: 0 } },
    ...testProcessingCostEvidence(), exports: { fixedMicros: 0, perGiBMicros: 0, maximumSourceBytes: 1_000_000, recoveryReserveMicros: 1 } });
function page<T>(data: T[]) { return Object.assign(Promise.resolve({ data: clone(data), has_more: false }), { async *[Symbol.asyncIterator]() { yield* clone(data); } }); }
// The Stripe fixture has a finite Oct 1–Nov 1 service period. Each test runs
// within that period independently of the host date; timer sleeps stay real.
test.beforeEach(t => {
    assert.ok('mock' in t);
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-20T12:00:00Z') });
});

function fixture() {
    const database = new MemoryBillingDatabase(), stripe = new FakeBillingStripe(), provider = stripe.asStripe();
    const plans = [planFixture(), planFixture({ key: 'pro', stripePriceId: 'price_pro', price: 20, limits: { storage: 4000, transcription: 4000 } }),
        planFixture({ key: 'lifetime', interval: 'lifetime', stripePriceId: 'price_lifetime' })];
    seedPublishedCatalogFixture(database, plans, 'lifecycle-unit');
    stripe.priceValues.get('price_base')!.unit_amount = 1000; stripe.priceValues.get('price_base')!.product = 'prod_base';
    stripe.priceValues.get('price_lifetime')!.unit_amount = 25000;
    stripe.priceValues.set('price_pro', { ...stripe.priceValues.get('price_base')!, id: 'price_pro', unit_amount: 2000 });
    const sub = stripe.subscription('sub_current', 'active', { authSubject: 'owner' });
    sub.items.data.unshift({ id: 'si_base', quantity: 1, price: stripe.priceValues.get('price_base')!, current_period_start: 1790812800, current_period_end: 1793491200 } as Stripe.SubscriptionItem);
    stripe.subscriptionValues.push(sub);
    database.collection('users').values.push(clone(userFixture({ planKey: 'standard', storageUsed: 0, stripeSubscriptionId: sub.id, stripeSubscriptionStatus: 'active',
        storageAllocation: 2000, transcriptionAllocation: 2000, stripeMetering: { subscriptionId: sub.id, storagePriceId: 'price_storage', transcriptionPriceId: 'price_transcription', verifiedAt: new Date() },
        billingEntitlement: { source: 'subscription', reference: sub.id, grantedAt: new Date() } })) as unknown as Record<string, unknown>);
    const state = { decline: false, updates: 0, loseUpdateResponse: false, grants: 0, grantLost: false, grantExpiries: 0, invoiceCreates: 0, loseInvoiceResponse: false };
    const line = (price: string | undefined, amount: number, metadata: Record<string, string> = {}) => ({ id: `line_${price || 'retention'}_${amount}`, amount, subtotal: amount,
        quantity: 1, currency: 'usd', period: { start: 1790812800, end: 1793491200 }, pricing: price ? { price_details: { price } } : null,
        parent: price === 'price_lifetime' || !price ? { type: 'invoice_item_details', invoice_item_details: { proration: false } }
            : { type: 'subscription_item_details', subscription_item_details: { proration: true, subscription: sub.id, subscription_item: 'si_base' } },
        description: price || 'Consumed benefit retention', discount_amounts: [], taxes: [], metadata }) as unknown as Stripe.InvoiceLineItem;
    const invoice = (params: { items?: Stripe.SubscriptionUpdateParams.Item[]; prorationDate?: number; invoice_items?: Array<Pick<Stripe.InvoiceCreatePreviewParams.InvoiceItem, 'price' | 'price_data' | 'quantity' | 'metadata'>> }) => {
        const item = params.items?.find(item => item.id === 'si_base');
        const lines = [line('price_base', -500), ...(item?.deleted ? [] : [line(item?.price || 'price_pro', 1000)]),
            ...(params.invoice_items || []).map(item => line(item.price, item.price ? stripe.priceValues.get(item.price)!.unit_amount! : item.price_data?.unit_amount || 0, item.metadata as Record<string, string>))];
        for (const row of lines) if (row.parent?.subscription_item_details?.proration) row.period.start = params.prorationDate || 1790812800;
        const total = lines.reduce((sum, item) => sum + item.amount, 0);
        return { id: 'in_change', customer: 'cus_owner', currency: 'usd', status: state.decline ? 'open' : 'paid', amount_due: Math.max(0, total), amount_remaining: state.decline ? total : 0,
            total, billing_reason: 'subscription_update', total_taxes: [], lines: { data: lines, has_more: false }, hosted_invoice_url: 'https://invoice.stripe.test/pay',
            parent: { subscription_details: { subscription: sub.id, metadata: clone(sub.metadata) } } } as unknown as Stripe.Invoice;
    };
    Object.assign(stripe.invoices, {
        list: (input: { status?: string } = {}) => page([...stripe.invoiceValues.values()].filter(row => !input.status || row.status === input.status)),
        createPreview: async (params: Stripe.InvoiceCreatePreviewParams) => {
            if (params.subscription) return invoice({ items: params.subscription_details?.items, prorationDate: params.subscription_details?.proration_date, invoice_items: params.invoice_items });
            const lines = (params.invoice_items || []).map(item => {
                const fractional = (item.unit_amount || 0) * Number(item.quantity_decimal || item.quantity || 1);
                const amount = item.amount ?? Math.sign(fractional) * Math.round(Math.abs(fractional));
                return { ...line(undefined, amount, item.metadata as Record<string, string>), period: item.period,
                    quantity_decimal: String(item.quantity_decimal || item.quantity || 1) };
            });
            const total = lines.reduce((sum, row) => sum + row.amount, 0);
            const product = params.subscription_details?.items?.[0].price_data?.product;
            if (product) lines.push({ ...line(undefined, 0), metadata: {}, period: { start: 0, end: 0 },
                pricing: { price_details: { product }, unit_amount_decimal: '0' },
                parent: { type: 'subscription_item_details', subscription_item_details: { proration: false } } } as unknown as typeof lines[number]);
            return { customer: 'cus_owner', currency: 'usd', total, amount_due: Math.max(0, total), lines: { data: lines, has_more: false } } as unknown as Stripe.Invoice;
        },
        create: async (params: Stripe.InvoiceCreateParams) => {
            state.invoiceCreates++;
            const created = { id: state.invoiceCreates === 1 ? 'in_change' : `in_change_${state.invoiceCreates}`, customer: 'cus_owner', currency: 'usd', status: 'draft', total: 0, amount_due: 0, amount_paid: 0, amount_remaining: 0,
                billing_reason: 'manual', metadata: params.metadata, lines: { data: [], has_more: false }, total_taxes: [], collection_method: params.collection_method } as unknown as Stripe.Invoice;
            stripe.invoiceValues.set(created.id, created);
            if (state.loseInvoiceResponse) { state.loseInvoiceResponse = false; throw new Error('Invoice response lost'); }
            return clone(created);
        },
        finalizeInvoice: async (id: string) => {
            const current = stripe.invoiceValues.get(id)!;
            current.status = state.decline ? 'open' : 'paid'; current.amount_remaining = state.decline ? current.amount_due : 0;
            current.amount_paid = state.decline ? 0 : current.amount_due;
            current.hosted_invoice_url = 'https://invoice.stripe.test/pay'; return clone(current);
        },
        voidInvoice: async (id: string) => { const current = stripe.invoiceValues.get(id)!; current.status = 'void'; current.amount_remaining = 0; return clone(current); },
        del: async (id: string) => { stripe.invoiceValues.delete(id); return { id, deleted: true }; },
    });
    Object.assign(stripe, { invoiceItems: { create: async (params: Stripe.InvoiceItemCreateParams) => {
        const current = stripe.invoiceValues.get(params.invoice!)!;
        current.lines.data.push({ ...line(undefined, params.amount!, params.metadata as Record<string, string>), period: params.period! });
        current.total = current.lines.data.reduce((sum, row) => sum + row.amount, 0); current.amount_due = Math.max(0, current.total); return {};
    } } });
    Object.assign(stripe.subscriptions, { update: async (_id: string, params: Stripe.SubscriptionUpdateParams) => {
        state.updates++;
        if (state.decline && params.payment_behavior === 'error_if_incomplete') {
            throw Object.assign(new Error('Payment requires another payment method or authentication.'), { statusCode: 402, type: 'StripeCardError' });
        }
        const current = stripe.subscriptionValues[0];
        const result = invoice({ items: params.items, invoice_items: params.add_invoice_items });
        for (const item of params.items || []) {
            if (item.id) {
                const index = current.items.data.findIndex(value => value.id === item.id);
                if (item.deleted) current.items.data.splice(index, 1);
                else if (item.price) current.items.data[index].price = stripe.priceValues.get(item.price)!;
            } else if (item.price) current.items.data.push({ id: `si_${item.price}`, price: stripe.priceValues.get(item.price)!, current_period_start: 1790812800, current_period_end: 1793491200 } as Stripe.SubscriptionItem);
        }
        Object.assign(current.metadata, params.metadata);
        result.parent!.subscription_details!.metadata = clone(current.metadata);
        if (params.proration_behavior === 'always_invoice') { stripe.invoiceValues.set(result.id, result); current.latest_invoice = result.id; current.status = state.decline ? 'past_due' : 'active'; }
        if (state.loseUpdateResponse) { state.loseUpdateResponse = false; throw new Error('Lost provider response'); }
        return clone(current);
    } });
    Object.assign(stripe, { invoicePayments: { list: (params: { invoice: string }) => {
        const current = stripe.invoiceValues.get(params.invoice);
        return page(current?.status === 'paid' && current.amount_due > 0 ? [{ invoice: current.id, currency: current.currency, is_default: true, status: 'paid', amount_paid: current.amount_due,
            payment: { type: 'payment_intent', payment_intent: current.id === 'in_change' ? 'pi_change' : `pi_for_${current.id}` } }] : []);
    } } });
    const grants = new Map<string, Stripe.Billing.CreditGrant>();
    Object.assign(stripe.billing, { creditGrants: {
        list: () => page([...grants.values()]), retrieve: async (id: string) => clone(grants.get(id)),
        create: async (params: Stripe.Billing.CreditGrantCreateParams) => {
            state.grants++;
            const grant = { id: `cg_${state.grants}`, customer: params.customer, category: 'paid', amount: params.amount,
                applicability_config: params.applicability_config, metadata: params.metadata } as unknown as Stripe.Billing.CreditGrant;
            grants.set(grant.id, grant);
            if (state.grantLost) { state.grantLost = false; throw new Error('Lost grant response'); }
            return clone(grant);
        },
        expire: async (id: string) => { const grant = grants.get(id)!; grant.expires_at = Math.floor(Date.now() / 1000); state.grantExpiries++; return clone(grant); },
    } });
    Object.assign(stripe.billing, { creditBalanceTransactions: { list: (params: { credit_grant?: string }) => page([...grants.values()]
        .filter(grant => !params.credit_grant || grant.id === params.credit_grant).flatMap(grant => [
            { id: `cbt_${grant.id}_granted`, credit_grant: grant.id, type: 'credit', credit: { type: 'credits_granted', amount: grant.amount } },
            ...(grant.expires_at ? [{ id: `cbt_${grant.id}_expired`, credit_grant: grant.id, type: 'debit', debit: { type: 'credits_expired', amount: grant.amount } }] : []),
        ])) } });
    Object.assign(stripe.paymentIntents, { retrieve: async (id: string) => ({ id, customer: 'cus_owner', amount_received: id === 'pi_change' ? stripe.invoiceValues.get('in_change')?.amount_due || 0 : id.startsWith('pi_for_') ? stripe.invoiceValues.get(id.slice(7))?.amount_due || 0 : 1000, currency: 'usd', status: 'succeeded',
        latest_charge: { id: 'ch_topup', paid: true, refunded: false, disputed: false, balance_transaction: { currency: 'usd', fee: 30 } }, payment_method: 'pm_saved' }) });
    Object.assign(stripe.paymentIntents, { list: () => page([]) });
    const deps = { db: database.asDb(), stripe: provider };
    Object.assign(stripe.checkout.sessions, { list: () => page([...stripe.sessions.values()]) });
    return { database, stripe, provider, deps, state, sub, plans };
}

test('legacy accepted credit reservations remain atomic and do not mint credit on repeated requests', async () => {
    const { database, deps } = fixture();
    await creditBaseFunds('owner', { id: 'cash', reference: 'in_paid_cash', kind: 'base', amountMicros: 10_000_000 }, deps.db);
    database.user().billingAccount!.fundingLots[ledgerKey('cash')].costMicros = 4_000_000;
    assert.equal(refundableBaseMicros(getBillingAccount(database.user())), 6_000_000);
    await reservePlanCredit('owner', 'switch', 600, deps.db);
    await reservePlanCredit('owner', 'switch', 600, deps.db);
    assert.equal(refundableBaseMicros(getBillingAccount(database.user())), 0);
    await assert.rejects(reservePlanCredit('owner', 'another', 1, deps.db), /credit changed/);
    await settlePlanCredit('owner', 'switch', false, deps.db);
    assert.equal(refundableBaseMicros(getBillingAccount(database.user())), 6_000_000);
});

test('immediate upgrade uses normal Stripe proration despite prior provider expenses and preserves consumed quota', async () => {
    const { database, deps, stripe } = fixture();
    await creditBaseFunds('owner', { id: 'cash', reference: 'in_cash', kind: 'base', amountMicros: 10_000_000 }, deps.db);
    database.user().billingAccount!.fundingLots[ledgerKey('cash')].costMicros = 8_000_000;
    database.user().transcriptionUsed = 1500;
    const quote = await createPlanChangePreview('owner', 'pro', deps);
    assert.equal(quote.baseCreditMinor, 500); assert.equal(quote.retainedCreditMinor, 0); assert.equal(quote.amountDueMinor, 500);
    const result = await applyPlanChange('owner', quote.id, false, deps);
    assert.equal(result.state, 'applied'); assert.equal(stripe.invoiceValues.get('in_change')!.amount_due, 500);
    assert.equal(Object.keys(getBillingAccount(database.user()).planCreditReservations || {}).length, 0);
    assert.equal(database.user().planKey, 'pro'); assert.equal(database.user().transcriptionUsed, 1500);
    assert.equal(database.user().billingOperation, undefined);
});

test('a real monthly boundary still requires renewed paid-service proof under the fixture clock', t => {
    const { database, state } = fixture(), user = database.user();
    user.stripeCurrentPeriodStart = new Date('2026-10-01T00:00:00Z');
    user.billingPaidBasePeriod = { customerId: user.stripeCustomerId!, customerGeneration: user.stripeCustomerGeneration || 0,
        subscriptionId: user.stripeSubscriptionId!, basePriceId: user.stripePriceId!, invoiceId: 'in_paid_october_only',
        start: new Date('2026-10-01T00:00:00Z'), end: new Date('2026-11-01T00:00:00Z') };
    const account = getBillingAccount(user);
    t.mock.timers.setTime(new Date('2026-10-31T23:59:59Z').getTime());
    const october = ensurePeriod(account, user);
    october.consumedSeconds = 1500;
    const beforeRenewal = clone(account);
    t.mock.timers.setTime(new Date('2026-11-01T00:00:00Z').getTime());
    assert.throws(() => ensurePeriod(account, user), BillingSyncPendingError);
    assert.deepEqual(account, beforeRenewal);
    assert.equal(state.updates, 0);
});

test('normal upgrade and prepaid grant fulfillment require no provider-cost configuration or customer expense holds', async t => {
    const before = process.env.MANAGED_COST_POLICY_JSON;
    delete process.env.MANAGED_COST_POLICY_JSON;
    t.after(() => { if (before !== undefined) process.env.MANAGED_COST_POLICY_JSON = before; });
    const { database, deps, stripe } = fixture();
    database.user().billingReview = { reason: 'provider_cost_evidence_requires_review', createdAt: new Date() };
    const quote = await createPlanChangePreview('owner', 'pro', deps);
    assert.equal(quote.baseCreditMinor, 500); assert.equal(quote.retainedCreditMinor, 0);
    assert.equal((await applyPlanChange('owner', quote.id, false, deps)).state, 'applied');
    const created = await createUsageTopup('owner', 1000, { success: 'https://app.example/success', cancel: 'https://app.example/cancel' }, deps);
    const attempt = database.collection('billing_prepaid_topups').values.find(row => row._id === created.attemptId)!;
    const session = stripe.sessions.get(String(attempt.sessionId))!;
    Object.assign(session, { status: 'complete', payment_status: 'paid', payment_intent: 'pi_topup', amount_total: 1000, currency: 'usd' });
    await confirmUsageTopup(session.id, deps);
    assert.equal(attempt.grantScope, 'metered');
    const grant = await deps.stripe.billing.creditGrants.retrieve(String(attempt.creditGrantId));
    assert.deepEqual(grant.applicability_config.scope, { price_type: 'metered' });
    assert.equal(database.user().billingAccount?.prepaidFundedMicros, 10_000_000);
    assert.equal(Object.values(database.user().billingAccount?.reservations || {}).some(row => row.maximumCostMicros > 0), false);
});

test('broad usage-credit payment is refused before checkout for a customer with an unrelated subscription', async () => {
    const { deps, stripe } = fixture();
    const foreign = clone(stripe.subscriptionValues[0]); foreign.id = 'sub_external';
    foreign.items.data[0].price.id = 'price_external_product'; stripe.subscriptionValues.push(foreign);
    await assert.rejects(createUsageTopup('owner', 500, { success: 'https://app.example/success', cancel: 'https://app.example/cancel' }, deps), /outside the approved/);
    assert.equal(stripe.sessionCreates, 0);
});

test('Lifetime conversion never silently turns a recurring price notice into different Lifetime prices', async () => {
    const { database, deps } = fixture(), pair = clone(database.user().billingUsageTariffs!);
    database.collection('billing_usage_price_rollouts').values.push({ _id: 'recurring-notice', authSubject: 'owner', customerId: 'cus_owner', subscriptionId: 'sub_current',
        state: 'scheduled', scheduleCoordinator: 1, sourceTariffs: pair, targetTariffs: pair, targetBundleId: 'future-catalog', noticedAt: new Date(), effectiveAt: new Date('2099-01-01') });
    database.user().billingUsagePriceRollout = { id: 'recurring-notice', state: 'scheduled', targetBundleId: 'future-catalog', noticedAt: new Date() };
    const quote = await createPlanChangePreview('owner', 'lifetime', deps);
    assert.equal((await applyPlanChange('owner', quote.id, false, deps)).state, 'applied');
    const notice = database.collection('billing_usage_price_rollouts').values[0];
    assert.equal(notice.state, 'canceled'); assert.deepEqual(notice.targetTariffs, pair);
    assert.equal(database.user().billingUsagePriceRollout?.state, 'canceled');
    assert.equal(database.user().billingUsageTariffs?.storage.usageTier, 'lifetime');
});

test('paid activation recovers a failed future-schedule restoration without another payment or contract update', async () => {
    const { database, deps, state } = fixture(), pair = clone(database.user().billingUsageTariffs!);
    database.collection('billing_usage_price_rollouts').values.push({ _id: 'missing-notice-catalog', authSubject: 'owner', customerId: 'cus_owner', subscriptionId: 'sub_current',
        state: 'scheduled', scheduleCoordinator: 1, sourceTariffs: pair, targetTariffs: pair, targetBundleId: 'unavailable-archive', noticedAt: new Date(), effectiveAt: new Date('2099-01-01') });
    const quote = await createPlanChangePreview('owner', 'pro', deps);
    await assert.rejects(applyPlanChange('owner', quote.id, false, deps), /notified usage-price change requires reconciliation/);
    assert.equal(database.user().planKey, 'pro');
    assert.equal(database.collection('billing_operations').values.find(row => row._id === quote.id)!.state, 'applying');
    // Operator reconciliation cancels the unusable notice; payment remains intact.
    database.collection('billing_usage_price_rollouts').values[0].state = 'canceled';
    assert.equal((await advancePlanChange(quote.id, deps)).state, 'applied');
    assert.equal(state.invoiceCreates, 1); assert.equal(state.updates, 1);
    assert.ok(database.collection('billing_operations').values.find(row => row._id === quote.id)!.scheduleRestoredAt);
});

for (const oldVersion of [undefined, 'contribution-floor-v0']) test(`an unaccepted ${oldVersion || 'unversioned'} credit quote requires a fresh preview`, async () => {
    const { database, deps, state } = fixture();
    await creditBaseFunds('owner', { id: 'cash', reference: 'in_cash', kind: 'base', amountMicros: 10_000_000 }, deps.db);
    const quote = await createPlanChangePreview('owner', 'pro', deps);
    const operation = database.collection('billing_operations').values.find(row => row._id === quote.id)!;
    assert.equal(operation.creditPolicyVersion, NORMAL_PRORATION_POLICY_VERSION);
    if (oldVersion === undefined) delete operation.creditPolicyVersion; else operation.creditPolicyVersion = oldVersion;
    const before = clone(database.user().billingAccount);
    await assert.rejects(applyPlanChange('owner', quote.id, false, deps), /credit policy changed.*fresh billing preview/);
    assert.equal(operation.state, 'quoted'); assert.equal(database.user().billingOperation, undefined);
    assert.deepEqual(database.user().billingAccount, before);
    assert.equal(state.invoiceCreates, 0); assert.equal(state.updates, 0); assert.equal(state.grantExpiries, 0);
});

test('an accepted unversioned payment keeps its frozen credit when the current policy permits more', async () => {
    const { database, deps, stripe, state } = fixture(); state.decline = true;
    await creditBaseFunds('owner', { id: 'cash', reference: 'in_cash', kind: 'base', amountMicros: 10_000_000 }, deps.db);
    database.user().billingAccount!.fundingLots[ledgerKey('cash')].costMicros = 8_000_000;
    const quote = await createPlanChangePreview('owner', 'pro', deps);
    assert.equal(quote.baseCreditMinor, 500); assert.equal(quote.amountDueMinor, 500);
    assert.equal((await applyPlanChange('owner', quote.id, false, deps)).state, 'awaiting_payment');
    const operation = database.collection('billing_operations').values.find(row => row._id === quote.id)!;
    delete operation.creditPolicyVersion;
    database.user().billingAccount!.fundingLots[ledgerKey('cash')].costMicros = 4_000_000;
    await reservePlanCredit('owner', quote.id, quote.baseCreditMinor, deps.db);
    operation.creditReserved = true;
    state.decline = false;
    const invoice = stripe.invoiceValues.get('in_change')!;
    invoice.status = 'paid'; invoice.amount_paid = 500; invoice.amount_remaining = 0;
    assert.equal((await applyPlanChange('owner', quote.id, false, deps)).state, 'applied');
    assert.equal(stripe.invoiceValues.get('in_change')!.amount_due, 500);
    assert.equal((operation.preview as { baseCreditMinor: number }).baseCreditMinor, 500);
    assert.equal(state.invoiceCreates, 1); assert.equal(database.user().planKey, 'pro');
});

test('sequential paid Standard to Pro to Lifetime credits the paid hosted Pro service once', async () => {
    const { database, stripe, deps, sub } = fixture();
    const base = sub.items.data[0];
    const initial = { id: 'in_initial', customer: 'cus_owner', status: 'paid', currency: 'usd', total: 1000, amount_due: 1000, amount_paid: 1000, amount_remaining: 0,
        billing_reason: 'subscription_create', metadata: {}, parent: { subscription_details: { subscription: sub.id } },
        lines: { has_more: false, data: [{ id: 'il_initial', amount: 1000, subtotal: 1000, currency: 'usd', quantity: 1, metadata: {}, discount_amounts: [], taxes: [],
            period: { start: base.current_period_start, end: base.current_period_end }, pricing: { price_details: { price: 'price_base' } },
            parent: { type: 'subscription_item_details', subscription_item_details: { proration: false, subscription: sub.id, subscription_item: base.id } } }] } } as unknown as Stripe.Invoice;
    stripe.invoiceValues.set(initial.id, initial); sub.latest_invoice = initial.id;
    await syncPaidInvoiceFunding(initial.id, deps);
    const first = await createPlanChangePreview('owner', 'pro', deps);
    assert.equal(first.baseCreditMinor, 500); assert.equal(first.amountDueMinor, 500);
    assert.equal((await applyPlanChange('owner', first.id, false, deps)).state, 'applied');
    const proOperation = database.collection('billing_operations').values.find(row => row._id === first.id)!;
    const service = (proOperation.hostedInvoice as { lines: { role: string; netAmountMinor: number }[] }).lines.find(line => line.role === 'base')!;
    assert.equal(service.netAmountMinor, 1000);
    const before = getBillingAccount(database.user());
    const lifetime = await createPlanChangePreview('owner', 'lifetime', deps);
    assert.equal(lifetime.baseCreditMinor, 1000, 'The obsolete native Standard credit is only500; hosted paid Pro service is1000');
    assert.equal(lifetime.amountDueMinor, 24000);
    const second = database.collection('billing_operations').values.find(row => row._id === lifetime.id)!;
    assert.equal((second.sourceServiceCredit as { invoiceId: string }).invoiceId, proOperation.invoiceId);
    assert.equal((second.hostedInvoice as { lines: { role: string }[] }).lines.filter(line => line.role === 'credit').length, 1);
    assert.equal((await applyPlanChange('owner', lifetime.id, false, deps)).state, 'applied');
    const after = getBillingAccount(database.user());
    assert.equal(after.recognizedRevenueMicros - before.recognizedRevenueMicros, 240_000_000, 'Only new Lifetime cash becomes new principal');
    assert.equal(after.prepaidFundedMicros, before.prepaidFundedMicros);
    assert.equal(database.user().planKey, 'lifetime');
    await advancePlanChange(first.id, deps); await advancePlanChange(lifetime.id, deps);
    assert.equal(getBillingAccount(database.user()).recognizedRevenueMicros, after.recognizedRevenueMicros);
});

test('hosted upgrade verification keeps the paid source plan usable and cancellation releases its reserved credit', async () => {
    const { database, deps, stripe, state, sub } = fixture(); state.decline = true;
    await creditBaseFunds('owner', { id: 'cash', reference: 'in_cash', kind: 'base', amountMicros: 10_000_000 }, deps.db);
    const before = refundableBaseMicros(getBillingAccount(database.user()));
    const quote = await createPlanChangePreview('owner', 'pro', deps);
    const result = await applyPlanChange('owner', quote.id, false, deps);
    assert.equal(result.state, 'awaiting_payment'); assert.equal(result.sourcePlanUsable, true); assert.ok(result.paymentUrl);
    assert.equal(sub.items.data[0].price.id, 'price_base'); assert.equal(sub.status, 'active');
    assert.equal(database.user().planKey, 'standard'); assert.equal(state.updates, 0);
    assert.equal(hasBillingIssue(database.user()), null); assert.equal(stripe.invoiceValues.get('in_change')?.status, 'open');
    await cancelPlanChange('owner', quote.id, deps);
    assert.equal(refundableBaseMicros(getBillingAccount(database.user())), before);
    assert.equal(database.user().billingOperation, undefined); assert.equal(stripe.invoiceValues.get('in_change')?.status, 'void');
    assert.equal((await advancePlanChange(quote.id, deps)).state, 'canceled'); assert.equal(state.updates, 0);
    state.decline = false;
    const retry = await createPlanChangePreview('owner', 'pro', deps);
    assert.equal((await applyPlanChange('owner', retry.id, false, deps)).state, 'applied'); assert.equal(state.updates, 1);
});

test('hosted invoice creation recovers response loss without a second invoice or subscription mutation', async () => {
    const { database, deps, state } = fixture(); state.decline = true; state.loseInvoiceResponse = true;
    const quote = await createPlanChangePreview('owner', 'pro', deps);
    await assert.rejects(applyPlanChange('owner', quote.id, false, deps), /Invoice response lost/);
    assert.equal((await advancePlanChange(quote.id, deps)).state, 'awaiting_payment');
    assert.equal(state.invoiceCreates, 1); assert.equal(state.updates, 0); assert.equal(hasBillingIssue(database.user()), null);
});

for (const takeover of ['lease', 'revision'] as const) test(`a stale open-invoice response cannot reopen source usage after ${takeover} takeover`, async () => {
    const { database, deps, provider, state } = fixture(); state.decline = true;
    const quote = await createPlanChangePreview('owner', 'pro', deps); await applyPlanChange('owner', quote.id, false, deps);
    const retrieve = provider.invoices.retrieve.bind(provider.invoices);
    let release!: () => void, entered!: () => void, pause = true;
    const paused = new Promise<void>(resolve => { entered = resolve; });
    const resumed = new Promise<void>(resolve => { release = resolve; });
    Object.assign(provider.invoices, { retrieve: async (id: string) => {
        const snapshot = await retrieve(id);
        if (pause && snapshot.status === 'open') { pause = false; entered(); await resumed; }
        return snapshot;
    } });
    const pending = advancePlanChange(quote.id, deps);
    await paused;
    const row = database.collection('billing_operations').values.find(row => row._id === quote.id)!;
    Object.assign(row, { state: 'draining', sourcePlanUsable: false, revision: Number(row.revision) + 1 });
    database.user().billingOperation = { ...database.user().billingOperation!, state: 'draining', sourcePlanUsable: false };
    if (takeover === 'lease') database.user().stripeBillingLease = { owner: 'new-owner', until: new Date(Date.now() + 300_000) };
    release(); await assert.rejects(pending, /Billing is updating/);
    assert.equal(row.state, 'draining'); assert.equal(row.sourcePlanUsable, false);
    assert.equal(database.user().billingOperation?.state, 'draining'); assert.equal(database.user().billingOperation?.sourcePlanUsable, false);
    if (takeover === 'lease') assert.equal(database.user().stripeBillingLease?.owner, 'new-owner');
});

for (const paid of [false, true]) test(`a newer administrator grant survives an ${paid ? 'authoritatively paid' : 'unpaid'} hosted change`, async () => {
    const { database, deps, stripe, state } = fixture(); state.decline = true;
    const quote = await createPlanChangePreview('owner', 'pro', deps); await applyPlanChange('owner', quote.id, false, deps);
    const newer = { source: 'admin' as const, reference: 'new-admin-grant', grantedAt: new Date() };
    database.user().billingEntitlement = newer; database.user().planKey = 'custom';
    if (paid) { stripe.invoiceValues.get('in_change')!.status = 'paid'; stripe.invoiceValues.get('in_change')!.amount_remaining = 0; }
    const result = await advancePlanChange(quote.id, deps);
    assert.equal(result.state, paid ? 'needs_review' : 'canceled'); assert.equal(state.updates, 0);
    assert.deepEqual(database.user().billingEntitlement, newer); assert.equal(database.user().planKey, 'custom');
    assert.equal(stripe.invoiceValues.get('in_change')!.status, paid ? 'paid' : 'void');
});

test('a billing customer generation change invalidates the unpaid quote without restoring its old identity', async () => {
    const { database, deps, stripe, state } = fixture(); state.decline = true;
    const quote = await createPlanChangePreview('owner', 'pro', deps); await applyPlanChange('owner', quote.id, false, deps);
    database.user().stripeCustomerGeneration = 1;
    assert.equal((await advancePlanChange(quote.id, deps)).state, 'canceled');
    assert.equal(state.updates, 0); assert.equal(database.user().stripeCustomerGeneration, 1);
    assert.equal(stripe.invoiceValues.get('in_change')!.status, 'void');
});

test('an abandoned hosted invoice expires without changing old metered usage or the paid subscription', async () => {
    const { database, deps, state, sub, stripe } = fixture(); state.decline = true;
    const quote = await createPlanChangePreview('owner', 'pro', deps); await applyPlanChange('owner', quote.id, false, deps);
    database.collection('usage_events').values.push({ _id: 'earned-usage', authSubject: 'owner', processingStatus: 'processed', value: 8 });
    database.collection('billing_operations').values.find(row => row._id === quote.id)!.paymentExpiresAt = new Date(Date.now() - 1000);
    assert.equal((await advancePlanChange(quote.id, deps)).state, 'canceled');
    assert.equal(stripe.invoiceValues.get('in_change')?.status, 'void'); assert.equal(state.updates, 0);
    assert.equal(sub.items.data[0].price.id, 'price_base'); assert.equal(database.collection('usage_events').values[0].value, 8);
    assert.equal(hasBillingIssue(database.user()), null);
});

test('paid hosted fulfillment waits for accepted uploads, refuses cancellation and then activates exactly once', async () => {
    const { database, deps, state, stripe } = fixture(); state.decline = true;
    const quote = await createPlanChangePreview('owner', 'pro', deps); await applyPlanChange('owner', quote.id, false, deps);
    database.user().uploadReservations = { accepted: 100 };
    stripe.invoiceValues.get('in_change')!.status = 'paid'; stripe.invoiceValues.get('in_change')!.amount_remaining = 0; stripe.invoiceValues.get('in_change')!.amount_paid = 500;
    await assert.rejects(advancePlanChange(quote.id, deps), /still finishing/);
    assert.equal(database.user().billingOperation?.sourcePlanUsable, undefined); assert.equal(state.updates, 0);
    await assert.rejects(cancelPlanChange('owner', quote.id, deps), /already been confirmed/);
    database.user().uploadReservations = {};
    assert.equal((await advancePlanChange(quote.id, deps)).state, 'applied');
    assert.equal((await advancePlanChange(quote.id, deps)).state, 'applied'); assert.equal(state.updates, 1);
});

for (const erased of [false, true]) test(`closed ${erased ? 'erased' : 'disabled'} account cancels its unpaid hosted invoice without restoring access`, async () => {
    const { database, deps, state, stripe, sub } = fixture(); state.decline = true;
    const quote = await createPlanChangePreview('owner', 'lifetime', deps); await applyPlanChange('owner', quote.id, false, deps);
    const user = database.user(); user.disabled = true;
    if (erased) { database.collection('billing_deleted_accounts').values.push(user as unknown as Record<string, unknown>); database.collection('users').values = []; }
    assert.equal((await advancePlanChange(quote.id, deps)).state, 'canceled');
    assert.equal(stripe.invoiceValues.get('in_change')!.status, 'void'); assert.equal(user.lifetimePurchase, undefined);
    assert.equal(state.updates, 0); assert.equal(sub.items.data[0].price.id, 'price_base'); assert.equal(user.disabled, true);
});

test('a paid hosted invoice arriving after erasure stays financial-only and grants no Lifetime entitlement', async () => {
    const { database, deps, state, stripe, sub } = fixture(); state.decline = true;
    const quote = await createPlanChangePreview('owner', 'lifetime', deps); await applyPlanChange('owner', quote.id, false, deps);
    const user = database.user(); user.disabled = true;
    database.collection('billing_deleted_accounts').values.push(user as unknown as Record<string, unknown>); database.collection('users').values = [];
    stripe.invoiceValues.get('in_change')!.status = 'paid'; stripe.invoiceValues.get('in_change')!.amount_remaining = 0;
    assert.equal((await advancePlanChange(quote.id, deps)).state, 'needs_review');
    assert.equal(state.updates, 0); assert.equal(user.lifetimePurchase, undefined); assert.equal(user.billingEntitlement?.source, 'subscription');
    assert.equal(sub.items.data[0].price.id, 'price_base'); assert.equal(database.collection('users').values.length, 0);
});

test('a third-party contract change after partial fulfillment is held instead of overwritten', async () => {
    const { deps, state, sub, stripe } = fixture(); state.loseUpdateResponse = true;
    const quote = await createPlanChangePreview('owner', 'pro', deps);
    await assert.rejects(applyPlanChange('owner', quote.id, false, deps), /Lost provider response/);
    sub.items.data[0].price = { ...stripe.priceValues.get('price_pro')!, id: 'price_external' };
    assert.equal((await advancePlanChange(quote.id, deps)).state, 'needs_review'); assert.equal(state.updates, 1);
    assert.equal(sub.items.data[0].price.id, 'price_external');
});

test('a draft tax or amount mismatch is discarded before any payment link is exposed', async () => {
    const { database, deps, provider, state, stripe } = fixture();
    const create = provider.invoiceItems.create.bind(provider.invoiceItems);
    Object.assign(provider.invoiceItems, { create: async (params: Stripe.InvoiceItemCreateParams) => create({ ...params, amount: params.amount! + 1 }) });
    const quote = await createPlanChangePreview('owner', 'pro', deps);
    const result = await applyPlanChange('owner', quote.id, false, deps);
    assert.equal(result.state, 'canceled'); assert.equal(result.paymentUrl, undefined); assert.equal(state.updates, 0);
    assert.equal(stripe.invoiceValues.size, 0); assert.equal(database.user().billingOperation, undefined);
});

test('a rejected payment recovers a lost verification response without retrying or charging another change', async () => {
    const { database, deps, state, provider } = fixture(); state.decline = true;
    const retrieve = provider.subscriptions.retrieve.bind(provider.subscriptions);
    let failVerification = true;
    Object.assign(provider.subscriptions, { retrieve: async (id: string) => {
        if (state.updates && failVerification) { failVerification = false; throw new Error('Verification response unavailable'); }
        return retrieve(id);
    } });
    const quote = await createPlanChangePreview('owner', 'pro', deps);
    delete database.collection('billing_operations').values.find(row => row._id === quote.id)!.paymentMode;
    await assert.rejects(applyPlanChange('owner', quote.id, false, deps), /Verification response unavailable/);
    assert.equal(database.user().billingOperation?.state, 'applying');
    assert.equal((await advancePlanChange(quote.id, deps)).state, 'canceled');
    assert.equal(state.updates, 1); assert.equal(database.user().billingOperation, undefined);
    assert.equal(database.user().planKey, 'standard'); assert.equal(hasBillingIssue(database.user()), null);
});

test('contradictory provider state after a payment rejection stays held instead of pretending rollback succeeded', async () => {
    const { database, deps, provider, sub, stripe } = fixture();
    Object.assign(provider.subscriptions, { update: async () => {
        sub.items.data[0].price = stripe.priceValues.get('price_pro')!;
        throw Object.assign(new Error('Uncertain payment rejection'), { statusCode: 402 });
    } });
    const quote = await createPlanChangePreview('owner', 'pro', deps);
    delete database.collection('billing_operations').values.find(row => row._id === quote.id)!.paymentMode;
    const result = await applyPlanChange('owner', quote.id, false, deps);
    assert.equal(result.state, 'needs_review'); assert.equal(database.user().planKey, 'standard');
    assert.equal(database.user().billingOperation?.state, 'needs_review');
    assert.equal(hasBillingIssue(database.user())?.allowed, false);
});

test('lost update response is recovered from authoritative subscription without repeating invoice or credit', async () => {
    const { deps, state } = fixture(); state.loseUpdateResponse = true;
    const quote = await createPlanChangePreview('owner', 'pro', deps);
    await assert.rejects(applyPlanChange('owner', quote.id, false, deps), /Lost provider response/);
    assert.equal((await advancePlanChange(quote.id, deps)).state, 'applied'); assert.equal(state.updates, 1);
});

test('lost-response recovery selects the operation invoice even after a later billing-cycle invoice exists', async () => {
    const { deps, stripe, state, sub } = fixture(); state.loseUpdateResponse = true;
    const quote = await createPlanChangePreview('owner', 'pro', deps);
    await assert.rejects(applyPlanChange('owner', quote.id, false, deps), /Lost provider response/);
    const later = { ...clone(stripe.invoiceValues.get('in_change')!), id: 'in_later_cycle', billing_reason: 'subscription_cycle' } as Stripe.Invoice;
    stripe.invoiceValues.set(later.id, later); sub.latest_invoice = later.id;
    Object.assign(stripe.invoices, { list: () => page([...stripe.invoiceValues.values()]) });
    const recovered = await advancePlanChange(quote.id, deps);
    assert.equal(recovered.state, 'applied'); assert.equal(recovered.invoiceId, 'in_change'); assert.equal(state.updates, 1);
});

test('lifetime conversion grants no ownership before paid proof and switches prices on the existing monthly meter items', async () => {
    const { database, deps, state, sub, stripe } = fixture(); state.decline = true;
    const meterItems = sub.items.data.filter(item => item.price.recurring?.usage_type === 'metered').map(item => item.id);
    const quote = await createPlanChangePreview('owner', 'lifetime', deps);
    assert.ok(quote.targetCatalogVersion);
    assert.equal(quote.usagePricing?.tier, 'lifetime');
    assert.equal(quote.usagePricing?.ready, true);
    assert.equal(quote.usagePricing?.minimumRecordingUsd, '0');
    assert.ok(quote.usagePricing?.providers.every(provider => Number(provider.usdPerMinute) > 0));
    assert.equal((await applyPlanChange('owner', quote.id, false, deps)).state, 'awaiting_payment');
    assert.equal(database.user().lifetimePurchase, undefined);
    assert.equal(hasBillingIssue(database.user()), null);
    assert.equal(sub.items.data[0].price.id, 'price_base'); assert.equal(stripe.invoiceValues.get('in_change')?.status, 'open');
    state.decline = false;
    stripe.invoiceValues.get('in_change')!.status = 'paid'; stripe.invoiceValues.get('in_change')!.amount_remaining = 0;
    await advancePlanChange(quote.id, deps);
    assert.equal(database.user().lifetimePurchase?.proof, 'invoice'); assert.equal(database.user().lifetimePurchase?.invoiceId, 'in_change');
    assert.deepEqual(sub.items.data.map(item => item.id), meterItems);
    assert.deepEqual(sub.items.data.map(item => item.price.id).sort(), ['price_lifetime_storage', 'price_lifetime_transcription']);
    assert.ok(database.user().billingUsageTariffs?.transcription.id);
    assert.equal(database.user().billingUsageTariffs?.storage.quantityUnit, 'milliGiB');
});

test('prepaid grants cover both immutable usage tiers and remain usable through immediate Lifetime conversion', async () => {
    const { database, deps, stripe } = fixture();
    const start = new Date(1790812800 * 1000), end = new Date(1793491200 * 1000);
    Object.assign(database.user(), { stripeCurrentPeriodStart: start, stripeCurrentPeriodEnd: end, transcriptionUsed: 1500 });
    const payment = await createUsageTopup('owner', 1000, { success: 'https://app.example/success', cancel: 'https://app.example/cancel' }, deps);
    const attempt = database.collection('billing_prepaid_topups').values.find(row => row._id === payment.attemptId)!;
    assert.deepEqual(attempt.grantPriceIds, ['price_lifetime_storage', 'price_lifetime_transcription', 'price_storage', 'price_transcription']);
    const session = stripe.sessions.get(String(attempt.sessionId))!;
    Object.assign(session, { status: 'complete', payment_status: 'paid', payment_intent: 'pi_topup', amount_total: 1000, currency: 'usd' });
    await confirmUsageTopup(session.id, deps);
    assert.equal(attempt.grantScope, 'metered');
    assert.deepEqual((await deps.stripe.billing.creditGrants.retrieve(String(attempt.creditGrantId))).applicability_config.scope, { price_type: 'metered' });
    const quote = await createPlanChangePreview('owner', 'lifetime', deps);
    assert.equal((await applyPlanChange('owner', quote.id, false, deps)).state, 'applied');
    assert.equal(database.user().stripeCurrentPeriodStart?.getTime(), start.getTime());
    assert.equal(database.user().stripeCurrentPeriodEnd?.getTime(), end.getTime());
    assert.equal(database.user().transcriptionUsed, 1500);
    assert.equal(database.user().billingAccount?.prepaidFundedMicros, 10_000_000);
    assert.equal(database.user().stripeMetering?.storagePriceId, 'price_lifetime_storage');
});

test('a spendable legacy grant with only recurring prices blocks Lifetime conversion before mutation', async () => {
    const { database, deps, provider, state } = fixture();
    const grant = await provider.billing.creditGrants.create({ customer: 'cus_owner', category: 'paid',
        amount: { type: 'monetary', monetary: { currency: 'usd', value: 500 } },
        applicability_config: { scope: { prices: [{ id: 'price_storage' }, { id: 'price_transcription' }] } } });
    await creditPrepaidFunds('owner', { id: `stripe-credit-grant:${grant.id}`, source: 'stripe', reference: grant.id, amountMicros: 5_000_000 }, deps.db);
    await assert.rejects(assertPrepaidGrantsCoverTarget(database.user(), { storage: 'price_lifetime_storage', transcription: 'price_lifetime_transcription' }, provider, deps.db), /Legacy prepaid credit/);
    assert.equal(state.updates, 0);
});

test('Lifetime and recurring meter prices reject the other tier even with correct monthly intervals', async () => {
    const { stripe, provider, plans } = fixture();
    await validateCheckoutPlan(provider, plans[2]);
    const lifetimeStorage = stripe.priceValues.get('price_lifetime_storage')!;
    lifetimeStorage.unit_amount_decimal = '999' as unknown as Stripe.Price['unit_amount_decimal'];
    await assert.rejects(validateCheckoutPlan(provider, plans[2]), /exact positive per-unit/);
});

test('new sales and top-ups require both published usage tiers before creating a remote payment', async () => {
    const { database, deps, stripe, plans } = fixture();
    const bundle = database.collection('billing_catalog_bundles').values[0];
    bundle.plans = (bundle.plans as { plan: { key: string } }[]).filter(entry => entry.plan.key !== 'lifetime');
    await assert.rejects(createUsageTopup('owner', 500, { success: 'https://app.example/success', cancel: 'https://app.example/cancel' }, deps), /Both recurring and Lifetime/);
    delete database.user().stripeSubscriptionId;
    await assert.rejects(createOrResumeCheckout('owner', plans[0], { success: 'https://app.example/success', cancel: 'https://app.example/cancel' }, deps), /Both recurring and Lifetime/);
    assert.equal(stripe.sessionCreates, 0);
});

test('authoritative sync preserves purchased quantity rates until a separately noticed monthly rollout activates', async () => {
    const { database, deps, sub } = fixture();
    const quote = await createPlanChangePreview('owner', 'lifetime', deps);
    await applyPlanChange('owner', quote.id, false, deps);
    const original = clone(database.user().billingUsageTariffs), originalCatalog = database.user().billingUsageCatalogVersion;
    const published = database.collection('billing_catalog_bundles').values[0];
    published._id = 'different-active-bundle';
    database.collection('billing_catalog_state').values[0].bundleId = 'different-active-bundle';
    await syncSubscription(sub.id, deps);
    assert.deepEqual(database.user().billingUsageTariffs, original);
    assert.equal(database.user().billingUsageCatalogVersion, originalCatalog);
});

test('a fresh Checkout pins its reviewed usage bundle when the same base price exists in older catalogs', async () => {
    const { database, deps, sub, stripe, plans } = fixture();
    const next = plans.map(plan => ({ ...clone(plan), billingCatalogVersion: `new-checkout:${plan.key}`,
        ...(plan.interval !== 'lifetime' ? { stripeStoragePriceId: 'price_storage_new', stripeTranscriptionPriceId: 'price_transcription_new' } : {}) }));
    seedPublishedCatalogFixture(database, next, 'lifecycle-unit', 'new-checkout');
    for (const kind of ['storage', 'transcription']) stripe.priceValues.set(`price_${kind}_new`, { ...clone(stripe.priceValues.get(`price_${kind}`)!), id: `price_${kind}_new` });
    const user = database.user(); delete user.billingUsageTariffs; delete user.billingUsageCatalogVersion; delete user.billingCatalogVersion; delete user.stripeMetering;
    sub.metadata.billingCatalogVersion = next[0].billingCatalogVersion;
    sub.items.data = sub.items.data.filter(item => item.id === 'si_base');
    sub.latest_invoice = 'in_new_checkout';
    stripe.invoiceValues.set('in_new_checkout', { id: 'in_new_checkout', status: 'paid' } as Stripe.Invoice);
    await creditBaseFunds('owner', { id: 'checkout-cash', reference: 'in_new_checkout', kind: 'base', amountMicros: 10_000_000 }, deps.db);
    await syncSubscription(sub.id, deps);
    assert.equal(database.user().stripeMetering?.storagePriceId, 'price_storage_new');
    assert.equal(database.user().billingUsageTariffs?.transcription.priceId, 'price_transcription_new');
    assert.equal(user.billingCatalogVersion, next[0].billingCatalogVersion);
    assert.equal(user.billingUsageCatalogVersion, next[0].billingCatalogVersion);
});

test('replacing the published usage catalog cancels an old quote before payment or grant transfers', async () => {
    const { database, deps, stripe, plans, state } = fixture();
    const quote = await createPlanChangePreview('owner', 'pro', deps);
    assert.equal(database.user().billingOperation, undefined); assert.equal(hasBillingIssue(database.user()), null);
    const next = plans.map(plan => ({ ...clone(plan), billingCatalogVersion: `next-offer:${plan.key}`,
        ...(plan.interval !== 'lifetime' ? { stripeStoragePriceId: 'price_storage_new', stripeTranscriptionPriceId: 'price_transcription_new' } : {}) }));
    seedPublishedCatalogFixture(database, next, 'lifecycle-unit', 'next-offer');
    database.collection('billing_catalog_state').values = database.collection('billing_catalog_state').values.filter(row => row.bundleId === 'next-offer');
    for (const kind of ['storage', 'transcription']) stripe.priceValues.set(`price_${kind}_new`, { ...clone(stripe.priceValues.get(`price_${kind}`)!), id: `price_${kind}_new` });
    const result = await applyPlanChange('owner', quote.id, false, deps);
    assert.equal(result.state, 'canceled'); assert.match(result.error!, /published pricing changed/);
    assert.equal(state.updates, 0); assert.equal(state.grantExpiries, 0);
    assert.equal(database.user().planKey, 'standard'); assert.equal(database.user().billingOperation, undefined);
    assert.equal(hasBillingIssue(database.user()), null);
});

test('canceled operation cleanup recovers after a crash without requiring an active operation summary', async () => {
    const { database, deps } = fixture();
    await creditBaseFunds('owner', { id: 'cash', reference: 'in_cash', kind: 'base', amountMicros: 10_000_000 }, deps.db);
    const quote = await createPlanChangePreview('owner', 'pro', deps);
    const before = refundableBaseMicros(getBillingAccount(database.user()));
    await reservePlanCredit('owner', quote.id, quote.baseCreditMinor, deps.db);
    const row = database.collection('billing_operations').values.find(row => row._id === quote.id)!;
    Object.assign(row, { state: 'canceled', creditReserved: true });
    await advancePlanChange(quote.id, deps);
    assert.equal(refundableBaseMicros(getBillingAccount(database.user())), before);
    assert.ok(row.cleanupCompletedAt); assert.equal(database.user().billingOperation, undefined);
    await advancePlanChange(quote.id, deps);
    assert.equal(refundableBaseMicros(getBillingAccount(database.user())), before);
});

test('in-flight work continues during hosted payment and canceling its unpaid invoice preserves the source plan', async () => {
    const { database, deps, state } = fixture(); state.decline = true;
    const quote = await createPlanChangePreview('owner', 'pro', deps);
    database.user().uploadReservations = { pending: 1 };
    assert.equal((await applyPlanChange('owner', quote.id, false, deps)).state, 'awaiting_payment');
    assert.equal(state.updates, 0); assert.equal(database.user().billingOperation?.sourcePlanUsable, true);
    await cancelPlanChange('owner', quote.id, deps);
    assert.equal(database.user().billingOperation, undefined);
});

test('base-only annual bootstrap recovers a lost meter attachment response without duplicating items', async () => {
    const { database, deps, sub, stripe, state, plans } = fixture();
    sub.items.data = sub.items.data.filter(item => item.id === 'si_base');
    sub.items.data[0].price.recurring!.interval = 'year'; sub.latest_invoice = 'in_initial';
    stripe.invoiceValues.set('in_initial', { id: 'in_initial', status: 'paid' } as Stripe.Invoice);
    state.loseUpdateResponse = true;
    await assert.rejects(ensureRecurringUsageBilling('owner', sub.id, plans[0], deps), /Lost provider response/);
    await ensureRecurringUsageBilling('owner', sub.id, plans[0], deps);
    assert.equal(sub.items.data.length, 3); assert.equal(state.updates, 1); assert.equal(database.user().usageBillingBootstrap?.state, 'ready');
});

test('paid top-up recovers lost grant creation without issuing or crediting a second grant', async () => {
    const { database, deps, stripe, state } = fixture();
    const created = await createUsageTopup('owner', 1000, { success: 'https://app.example/success', cancel: 'https://app.example/cancel' }, deps);
    const attempt = database.collection('billing_prepaid_topups').values.find(row => row._id === created.attemptId)!;
    const session = stripe.sessions.get(String(attempt.sessionId))!;
    session.status = 'complete'; session.payment_status = 'paid'; session.payment_intent = 'pi_topup'; session.amount_total = 1000; session.currency = 'usd';
    state.grantLost = true;
    await assert.rejects(confirmUsageTopup(session.id, deps), /Lost grant response/);
    await confirmUsageTopup(session.id, deps); await confirmUsageTopup(session.id, deps);
    assert.equal(state.grants, 1); assert.equal(database.user().billingAccount?.prepaidFundedMicros, 10_000_000);
    assert.equal(Object.values(database.user().billingAccount!.fundingLots)[0].processorFeeMicros, 300_000);
});

test('processor fees remain separate from provider costs and funding replay never understates their cost', async () => {
    const { database, deps } = fixture();
    await creditBaseFunds('owner', { id: 'cash', reference: 'in_cash', kind: 'base', amountMicros: 10_000_000 }, deps.db);
    const lot = database.user().billingAccount!.fundingLots[ledgerKey('cash')];
    lot.costMicros = 2_000_000; database.user().billingAccount!.recognizedCostMicros = 2_000_000;
    await creditBaseFunds('owner', { id: 'cash', reference: 'in_cash', kind: 'base', amountMicros: 10_000_000, processorFeeMicros: 300_000 }, deps.db);
    await creditBaseFunds('owner', { id: 'cash', reference: 'in_cash', kind: 'base', amountMicros: 10_000_000, processorFeeMicros: 300_000 }, deps.db);
    assert.equal(database.user().billingAccount!.fundingLots[ledgerKey('cash')].costMicros, 2_300_000);
    assert.equal(database.user().billingAccount!.recognizedCostMicros, 2_300_000);
});

test('prepaid processor fees reserve and recognize proportionally without blocking the first usage purchase', async () => {
    const { database, deps } = fixture();
    await creditBaseFunds('owner', { id: 'base-buffer', reference: 'in_base_buffer', kind: 'base', amountMicros: 1_000_000 }, deps.db);
    await creditPrepaidFunds('owner', { id: 'credit', reference: 'cg_credit', source: 'stripe', amountMicros: 10_000_000, processorFeeMicros: 300_000 }, deps.db);
    assert.equal(database.user().billingAccount!.recognizedCostMicros, 0);
    await reserveLegacyCostFixture('owner', { id: 'first', maximumCostMicros: 100_000, retailMicros: 1_000_000, kind: 'transcription', expiresAt: new Date(Date.now() + 60_000) }, deps.db);
    await settlePrepaidReservation('owner', 'first', { actualCostMicros: 100_000, chargedMicros: 1_000_000 }, deps.db);
    const account = database.user().billingAccount!;
    assert.equal(account.prepaidSpentMicros, 1_000_000); assert.equal(account.recognizedCostMicros, 130_000);
    assert.equal(account.fundingLots[ledgerKey('credit')].processorFeeRecognizedMicros, 30_000);
});

test('plan-change credits preserve original cash and recognize only newly collected cash once', async () => {
    const { database, deps, stripe } = fixture();
    Object.assign(stripe, { invoicePayments: { list: () => page([]) } });
    await creditBaseFunds('owner', { id: 'original_cash', reference: 'in_original', kind: 'base', amountMicros: 10_000_000 }, deps.db);
    database.user().billingAccount!.fundingLots[ledgerKey('original_cash')].costMicros = 8_000_000;
    const quote = await createPlanChangePreview('owner', 'pro', deps);
    await assert.rejects(applyPlanChange('owner', quote.id, false, deps), /payment settlement is being confirmed/);
    assert.equal(Object.keys(database.user().billingAccount!.fundingLots).length, 1);
    Object.assign(stripe, { invoicePayments: { list: () => page([{ invoice: 'in_change', currency: 'usd', status: 'paid', amount_paid: 500,
        payment: { type: 'payment_intent', payment_intent: 'pi_change' } }]) } });
    Object.assign(stripe.paymentIntents, { retrieve: async () => ({ id: 'pi_change', status: 'succeeded', amount_received: 500, currency: 'usd', customer: 'cus_owner',
        latest_charge: { paid: true, refunded: false, disputed: false, balance_transaction: { currency: 'usd', fee: 30 } } }) });
    assert.equal((await advancePlanChange(quote.id, deps)).state, 'applied');
    await syncPaidInvoiceFunding('in_change', deps); await syncPaidInvoiceFunding('in_change', deps);
    const funded = database.user().billingAccount!.fundingLots[ledgerKey('stripe-invoice:in_change')];
    assert.equal(funded.amountMicros, 5_000_000); assert.equal(funded.processorFeeMicros, 300_000);
    assert.equal(database.user().billingAccount!.fundingLots[ledgerKey('original_cash')].creditedMicros, 0);
    assert.equal(database.user().billingAccount!.recognizedRevenueMicros, 15_000_000);
    assert.equal(Object.keys(database.user().billingAccount!.fundingLots).length, 2);
});

test('a reversed top-up expires its provider grant and removes only unused local credit exactly once', async () => {
    const { database, deps, stripe, state } = fixture();
    await creditBaseFunds('owner', { id: 'base-buffer', reference: 'in_base_buffer', kind: 'base', amountMicros: 1_000_000 }, deps.db);
    const created = await createUsageTopup('owner', 1000, { success: 'https://app.example/success', cancel: 'https://app.example/cancel' }, deps);
    const attempt = database.collection('billing_prepaid_topups').values.find(row => row._id === created.attemptId)!;
    const session = stripe.sessions.get(String(attempt.sessionId))!;
    session.status = 'complete'; session.payment_status = 'paid'; session.payment_intent = 'pi_topup'; session.amount_total = 1000; session.currency = 'usd';
    await confirmUsageTopup(session.id, deps);
    await reserveLegacyCostFixture('owner', { id: 'used', maximumCostMicros: 100_000, retailMicros: 1_000_000, kind: 'transcription', expiresAt: new Date(Date.now() + 60_000) }, deps.db);
    await settlePrepaidReservation('owner', 'used', { actualCostMicros: 100_000, chargedMicros: 1_000_000 }, deps.db);
    Object.assign(stripe, { charges: { retrieve: async () => ({ id: 'ch_refund', customer: 'cus_owner', payment_intent: 'pi_topup', amount_refunded: 1000, disputed: false }) } });
    await suspendPrepaidForCharge('ch_refund', deps); await suspendPrepaidForCharge('ch_refund', deps);
    const account = database.user().billingAccount!;
    assert.equal(state.grantExpiries, 1); assert.equal(account.prepaidFundedMicros, 1_000_000); assert.equal(account.prepaidSpentMicros, 1_000_000);
    assert.equal(Object.values(account.fundingLots).find(lot => lot.kind === 'prepaid')!.revokedMicros, 9_000_000);
    assert.equal(database.user().billingReview?.reason, 'prepaid_grant_lineage_adjustment');
    assert.equal(account.costReview?.reason, 'prepaid_payment_reversed');
});

test('USD retail receipts support INR processor settlement with conservative exact fee conversion', async () => {
    assert.equal(processorFeeUsdMicros({ fee: 2500, currency: 'inr', exchange_rate: 100 } as Stripe.BalanceTransaction), 250_000);
    assert.equal(processorFeeUsdMicros({ fee: 1, currency: 'inr', exchange_rate: 3 } as Stripe.BalanceTransaction), 3334);
    assert.throws(() => processorFeeUsdMicros({ fee: 2500, currency: 'inr', exchange_rate: null } as Stripe.BalanceTransaction), /confirmed USD exchange rate/);
    const { database, deps, stripe } = fixture();
    Object.assign(stripe, { invoicePayments: { list: () => page([{ invoice: 'in_change', currency: 'usd', status: 'paid', amount_paid: 500,
        payment: { type: 'payment_intent', payment_intent: 'pi_change' } }]) } });
    Object.assign(stripe.paymentIntents, { retrieve: async () => ({ id: 'pi_change', status: 'succeeded', amount_received: 500, currency: 'usd', customer: 'cus_owner',
        latest_charge: { paid: true, refunded: false, disputed: false, balance_transaction: { currency: 'inr', fee: 2500, exchange_rate: 100 } } }) });
    const quote = await createPlanChangePreview('owner', 'pro', deps); await applyPlanChange('owner', quote.id, false, deps);
    await syncPaidInvoiceFunding('in_change', deps);
    assert.equal(database.user().billingAccount!.fundingLots[ledgerKey('stripe-invoice:in_change')].processorFeeMicros, 250_000);
});

test('renewed automatic-payment consent retires a known unpaid intent before allowing a replacement', async () => {
    const { database, deps, stripe } = fixture();
    database.collection('billing_prepaid_topups').values.push({ _id: 'old_auto', authSubject: 'owner', customerId: 'cus_owner', kind: 'automatic',
        amountMinor: 1000, state: 'needs_review', paymentIntentId: 'pi_declined', createdAt: new Date(), updatedAt: new Date() });
    let canceled = 0;
    Object.assign(stripe.paymentIntents, { retrieve: async () => ({ id: 'pi_declined', status: 'requires_payment_method', customer: 'cus_owner' }),
        cancel: async () => { canceled++; return { id: 'pi_declined', status: 'canceled' }; } });
    await updateAutomaticTopup('owner', { enabled: true, thresholdMinor: 500, amountMinor: 1000, dailyCapMinor: 2000, monthlyCapMinor: 10000 }, deps);
    assert.equal(canceled, 1); assert.equal(database.collection('billing_prepaid_topups').values[0].state, 'failed');
    assert.equal(database.user().automaticTopup?.enabled, true); assert.ok(database.user().automaticTopup?.consentedAt);
});

test('excess downgrade credit stays backed and unavailable until a later base invoice redeems it once', async () => {
    const { database, deps, stripe } = fixture();
    await creditBaseFunds('owner', { id: 'original', reference: 'in_original', kind: 'base', amountMicros: 10_000_000 }, deps.db);
    await reservePlanCredit('owner', 'banked', 900, deps.db); await settlePlanCredit('owner', 'banked', true, deps.db);
    database.collection('billing_operations').values.push({ _id: 'banked', authSubject: 'owner', customerId: 'cus_owner', invoiceId: 'in_bank', preview: { baseCreditMinor: 900 } });
    const makeInvoice = (id: string, debit: number, credit: number, reason: string) => ({ id, customer: 'cus_owner', status: 'paid', currency: 'usd',
        billing_reason: reason, metadata: reason === 'subscription_update' ? { billingOperationId: 'banked' } : {}, total_taxes: [],
        parent: { subscription_details: { subscription: 'sub_current', metadata: { billingOperationId: 'banked' } } },
        lines: { data: [{ id: `${id}_base`, amount: debit, subtotal: debit, pricing: { price_details: { price: 'price_pro' } } },
            ...(credit ? [{ id: `${id}_credit`, amount: -credit, subtotal: -credit, pricing: { price_details: { price: 'price_base' } } }] : [])], has_more: false } }) as unknown as Stripe.Invoice;
    stripe.invoiceValues.set('in_bank', makeInvoice('in_bank', 400, 900, 'subscription_update'));
    Object.assign(stripe.customers, { listBalanceTransactions: () => page([]) });
    await syncPaidInvoiceFunding('in_bank', deps);
    assert.equal(database.user().billingAccount!.fundingLots[ledgerKey('original')].creditedMicros, 5_000_000);
    stripe.invoiceValues.set('in_renewal', makeInvoice('in_renewal', 300, 0, 'subscription_cycle'));
    Object.assign(stripe.customers, { listBalanceTransactions: () => page([{ type: 'applied_to_invoice', currency: 'usd', amount: 300, invoice: 'in_renewal' }]) });
    await syncPaidInvoiceFunding('in_renewal', deps); await syncPaidInvoiceFunding('in_renewal', deps);
    const account = database.user().billingAccount!;
    assert.equal(account.fundingLots[ledgerKey('original')].creditedMicros, 2_000_000);
    assert.equal(account.recognizedRevenueMicros, 10_000_000); assert.equal(account.prepaidFundedMicros, 0);
    assert.equal(Object.keys(account.fundingLots).length, 1);
});

test('new live top-ups and first plan application require exact launch evidence while paid recovery remains available', async t => {
    const names = ['STRIPE_SECRET_KEY', 'BILLING_LAUNCH_EVIDENCE_JSON', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_METER_WEBHOOK_SECRET'];
    const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
    t.after(() => { for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; });
    const { deps, state, stripe } = fixture();
    const quote = await createPlanChangePreview('owner', 'pro', deps);
    process.env.STRIPE_SECRET_KEY = 'sk_live_fixture'; delete process.env.BILLING_LAUNCH_EVIDENCE_JSON;
    await assert.rejects(createUsageTopup('owner', 1000, { success: 'https://app.example/success', cancel: 'https://app.example/cancel' }, deps), /Live billing is blocked/);
    await assert.rejects(applyPlanChange('owner', quote.id, false, deps), /Live billing is blocked/);
    assert.equal(stripe.sessionCreates, 0); assert.equal(state.updates, 0);
    await cancelPlanChange('owner', quote.id, deps);
    process.env.STRIPE_SECRET_KEY = 'test'; state.loseUpdateResponse = true;
    const retry = await createPlanChangePreview('owner', 'pro', deps);
    await assert.rejects(applyPlanChange('owner', retry.id, false, deps), /Lost provider response/);
    stripe.invoiceValues.get('in_change')!.status = 'paid'; stripe.subscriptionValues[0].status = 'active';
    process.env.STRIPE_SECRET_KEY = 'sk_live_fixture';
    assert.equal((await advancePlanChange(retry.id, deps)).state, 'applied');
});

test('usage funding permits a purchased archived catalog and refuses unpublished or uncovered price mappings', async t => {
    const { database, deps, stripe } = fixture();
    database.collection('plans').values[0].isActive = false;
    database.user().billingCatalogVersion = String(database.collection('plans').values[0].billingCatalogVersion);
    await createUsageTopup('owner', 1000, { success: 'https://app.example/success', cancel: 'https://app.example/cancel' }, deps);
    assert.equal(stripe.sessionCreates, 1);
    database.collection('billing_prepaid_topups').values = [];
    const names = ['STRIPE_SECRET_KEY', 'BILLING_LAUNCH_EVIDENCE_JSON', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_METER_WEBHOOK_SECRET'];
    const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
    t.after(() => { for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; });
    process.env.STRIPE_SECRET_KEY = 'sk_live_fixture'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fixture'; process.env.STRIPE_METER_WEBHOOK_SECRET = 'whsec_fixture';
    process.env.BILLING_LAUNCH_EVIDENCE_JSON = JSON.stringify({ tariffVersion: BILLING_CATALOG.version, costVersion: 'lifecycle-unit', stripeAccountId: 'acct_fixture',
        verifiedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 86400_000).toISOString(), priceIds: ['price_unrelated'],
        checks: Object.fromEntries(REQUIRED_BILLING_CHECKS.map(check => [check, true])) });
    await assert.rejects(createUsageTopup('owner', 1000, { success: 'https://app.example/success', cancel: 'https://app.example/cancel' }, deps), /does not cover/);
    process.env.STRIPE_SECRET_KEY = 'test'; database.collection('billing_catalog_versions').values = [];
    await assert.rejects(createUsageTopup('owner', 1000, { success: 'https://app.example/success', cancel: 'https://app.example/cancel' }, deps), /usage catalog archive/);
    assert.equal(stripe.sessionCreates, 1);
});

test('provider expense observations do not block ordinary Stripe proration or paid activation', async () => {
    const { database, deps, state } = fixture();
    const quote = await createPlanChangePreview('owner', 'pro', deps);
    database.collection('billing_provider_cost_evidence').values.push({ _id: 'unapplied-cost', subject: 'owner' });
    assert.equal((await createPlanChangePreview('owner', 'pro', deps)).retainedCreditMinor, 0);
    assert.equal((await applyPlanChange('owner', quote.id, false, deps)).state, 'applied');
    assert.equal(state.updates, 1);
});

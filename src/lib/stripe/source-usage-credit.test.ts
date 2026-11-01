import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type Stripe from 'stripe';
import { FakeBillingStripe, MemoryBillingDatabase, clone, planFixture, userFixture } from './test-support';
import { getBillingAccount, ledgerKey, mutateUsageBillingAccount, reserveCost, retainedFundingCapacity, type ReserveCostInput } from './ledger';
import { reservePlanCredit } from './plan-credit-economics';
import { advancePlanChange, applyPlanChange, cancelUnpaidUpgradeForSourceUsage, subscriptionFingerprint, type BillingChangeOperation } from './plan-change';
import { PendingPlanCreditBlocksUsageError, PrepaidFundingRequiredError } from './billing-errors';

const request: ReserveCostInput = { id: 'source-work', kind: 'transcription', retailMicros: 0, maximumCostMicros: 100,
    expiresAt: new Date('2099-01-01'), paymentFeeSchedule: { costPolicyVersion: 'test', costPolicyFingerprint: 'test',
        expiresAt: '2099-01-01', paymentFeeBasisPoints: 0, paymentFixedMicros: 0, minimumTopupMicros: 5_000_000 } };

async function fixture() {
    const database = new MemoryBillingDatabase(), stripe = new FakeBillingStripe(), provider = stripe.asStripe();
    const sub = stripe.subscription('sub_source', 'active');
    sub.items.data.unshift({ id: 'si_base', quantity: 1, price: stripe.priceValues.get('price_base')!,
        current_period_start: 1790812800, current_period_end: 1793491200 } as Stripe.SubscriptionItem);
    stripe.subscriptionValues.push(sub);
    const user = userFixture({ planKey: 'standard', stripePriceId: 'price_base', stripeSubscriptionId: sub.id, stripeSubscriptionStatus: 'active',
        billingEntitlement: { source: 'subscription', reference: sub.id, grantedAt: new Date('2026-10-01') },
        stripeMetering: { subscriptionId: sub.id, storagePriceId: 'price_storage', transcriptionPriceId: 'price_transcription', verifiedAt: new Date() },
        billingOperation: { id: 'upgrade', state: 'awaiting_payment', kind: 'plan_change', targetPlanKey: 'pro', sourcePlanUsable: true,
            currency: 'usd', amountDueMinor: 1200, createdAt: new Date(), updatedAt: new Date(), invoiceId: 'in_upgrade' } });
    const account = getBillingAccount(user);
    account.fundingLots.base = { id: 'base', kind: 'base', source: 'stripe', reference: 'in_paid_source', amountMicros: 10_000_000,
        creditedMicros: 0, costMicros: 1_000_000, reservedCostMicros: 1_000_000, createdAt: new Date() };
    account.recognizedRevenueMicros = 10_000_000; account.recognizedCostMicros = 1_000_000; account.reservedCostMicros = 1_000_000;
    user.billingAccount = account;
    database.collection('users').values.push(user as never);
    await reservePlanCredit('owner', 'upgrade', 800, database.asDb());
    const target = planFixture({ key: 'pro', name: 'Pro', stripePriceId: 'price_pro', price: 20 });
    const lines = [
        { key: '0', originalPriceId: 'price_base', netAmountMinor: -1000, role: 'credit' as const },
        { key: '1', originalPriceId: 'price_pro', netAmountMinor: 2000, role: 'base' as const },
        { key: '2', netAmountMinor: 200, role: 'retention' as const },
    ].map(line => ({ ...line, description: line.role, period: { start: 1790812800, end: 1793491200 }, taxBehavior: 'exclusive' as const, taxes: [] }));
    const operation: BillingChangeOperation = { _id: 'upgrade', authSubject: 'owner', customerId: 'cus_owner', subscriptionId: sub.id,
        state: 'awaiting_payment', kind: 'plan_change', sourcePlanKey: 'standard', target, sourceFingerprint: subscriptionFingerprint(sub),
        sourceLocalFingerprint: createHash('sha256').update(JSON.stringify({ entitlement: user.billingEntitlement, generation: 0,
            customerId: user.stripeCustomerId, planKey: user.planKey })).digest('hex'),
        sourceMeterPriceIds: { storage: 'price_storage', transcription: 'price_transcription' }, creditReserved: true,
        invoiceId: 'in_upgrade', invoiceStartedAt: new Date(), paymentMode: 'hosted_invoice', sourcePlanUsable: true,
        hostedInvoice: { lines, currency: 'usd', totalMinor: 1200, amountDueMinor: 1200 },
        createdAt: new Date(), updatedAt: new Date(), expiresAt: new Date('2099-01-01'), paymentExpiresAt: new Date('2099-01-01'),
        prorationDate: 1790812800, params: {}, revision: 0,
        preview: { id: 'upgrade', expiresAt: '2099-01-01', effectiveAt: new Date().toISOString(), targetPlanKey: 'pro', currency: 'usd',
            amountDueMinor: 1200, baseCreditMinor: 800, retainedCreditMinor: 200, usageChargesMinor: 0, lines: [], requiresPayment: true,
            storageOverageConsent: false, retainedStorageBytes: 0, rates: user.billingUsageTariffs! } };
    database.collection('billing_operations').values.push(clone(operation) as never);
    const invoice = { id: 'in_upgrade', customer: 'cus_owner', currency: 'usd', status: 'open', amount_paid: 0,
        amount_due: 1200, amount_remaining: 1200, total: 1200, metadata: { billingOperationId: 'upgrade', purpose: 'plan_change_payment', sourceSubscriptionId: sub.id },
        lines: { has_more: false, data: lines.map(line => ({ id: `il_${line.key}`, amount: line.netAmountMinor, subtotal: line.netAmountMinor,
            currency: 'usd', period: line.period, discount_amounts: [], taxes: [], metadata: { billingOperationId: 'upgrade', hostedLineKey: line.key,
                ...(line.originalPriceId ? { originalPriceId: line.originalPriceId } : {}) } })) } } as unknown as Stripe.Invoice;
    stripe.invoiceValues.set(invoice.id, invoice);
    const state = { voids: 0, loseVoidResponse: false, keepProcessingAfterVoid: false, keepOpenPaymentAfterVoid: true, payDuringVoid: false };
    const intent = { id: 'pi_upgrade', customer: 'cus_owner', currency: 'usd', status: 'requires_action', amount_received: 0 } as Stripe.PaymentIntent;
    const payment = { id: 'inpay_upgrade', invoice: invoice.id, currency: 'usd', is_default: true, status: 'open', amount_paid: null,
        payment: { type: 'payment_intent', payment_intent: intent.id } } as Stripe.InvoicePayment;
    const payments = [payment];
    Object.assign(stripe, { invoicePayments: { list: () => ({ async *[Symbol.asyncIterator]() { yield* clone(payments); } }) } });
    Object.assign(stripe.paymentIntents, { retrieve: async () => clone(intent) });
    Object.assign(stripe.invoices, { voidInvoice: async () => {
        state.voids++;
        if (state.payDuringVoid) {
            invoice.status = 'paid'; invoice.amount_paid = 1200; invoice.amount_remaining = 0;
            intent.status = 'succeeded'; intent.amount_received = 1200; payment.status = 'paid'; payment.amount_paid = 1200;
            throw new Error('Invoice was paid before voiding');
        }
        invoice.status = 'void'; invoice.amount_remaining = 0;
        intent.status = state.keepProcessingAfterVoid ? 'processing' : 'canceled';
        payment.status = state.keepProcessingAfterVoid || state.keepOpenPaymentAfterVoid ? 'open' : 'canceled';
        if (state.loseVoidResponse) { state.loseVoidResponse = false; throw new Error('Void response lost'); }
        return clone(invoice);
    } });
    const deps = { db: database.asDb(), stripe: provider };
    const recover = (error: PendingPlanCreditBlocksUsageError) => cancelUnpaidUpgradeForSourceUsage('owner', error, deps);
    const run = (input: ReserveCostInput = request) => mutateUsageBillingAccount('owner', (latestAccount, latest) => reserveCost(latestAccount, latest, input), deps.db, recover);
    const heldCredit = () => database.user().billingAccount!.planCreditReservations![ledgerKey('upgrade')];
    const savedOperation = () => database.collection('billing_operations').values[0] as unknown as BillingChangeOperation;
    return { database, stripe, deps, sub, invoice, payment, payments, intent, state, recover, run, heldCredit, savedOperation };
}

for (const kind of ['transcription', 'storage-upload', 'ai:summary', 'export']) test(`otherwise affordable ${kind} cancels only the unpaid upgrade and resumes on the paid source`, async () => {
    const value = await fixture();
    assert.equal(retainedFundingCapacity(getBillingAccount(value.database.user())), 0);
    assert.equal(value.heldCredit().state, 'reserved'); assert.equal(value.heldCredit().amountMicros, 8_000_000);
    const result = await value.run({ ...request, kind });
    assert.equal(result.state, 'reserved'); assert.equal(value.state.voids, 1);
    assert.equal(value.invoice.status, 'void'); assert.equal(value.intent.status, 'canceled');
    assert.equal(value.payment.status, 'open', 'Real Stripe may retain an open default link after its intent is canceled');
    assert.equal(value.heldCredit().state, 'released'); assert.equal(value.database.user().billingAccount!.fundingLots.base.creditedMicros, 0);
    assert.equal(value.database.user().planKey, 'standard'); assert.equal(value.database.user().billingOperation, undefined);
    assert.equal(value.database.user().billingAccount!.recognizedRevenueMicros, 10_000_000);
    assert.equal(value.database.user().billingAccount!.prepaidFundedMicros, 0);
    assert.equal(value.savedOperation().state, 'canceled'); assert.match(value.savedOperation().error!, /current paid plan.*fresh upgrade quote/);
});

test('a canceled default InvoicePayment link also supplies valid terminal proof', async () => {
    const value = await fixture(); value.state.keepOpenPaymentAfterVoid = false;
    await value.run();
    assert.equal(value.payment.status, 'canceled'); assert.equal(value.heldCredit().state, 'released');
});

test('genuine cost exhaustion, missing prepaid funds and account holds never cancel an upgrade', async () => {
    const expensive = await fixture();
    await assert.rejects(expensive.run({ ...request, maximumCostMicros: 8_000_001 }), error => error instanceof Error && !(error instanceof PendingPlanCreditBlocksUsageError));
    const unfunded = await fixture(); await assert.rejects(unfunded.run({ ...request, retailMicros: 1 }), PrepaidFundingRequiredError);
    const debt = await fixture(); debt.database.user().stripePaymentIssues = { in_debt: { state: 'failed', subscriptionId: 'sub_old', updatedAt: new Date() } };
    await assert.rejects(debt.run(), /paused/);
    for (const value of [expensive, unfunded, debt]) { assert.equal(value.state.voids, 0); assert.equal(value.heldCredit().state, 'reserved'); }
});

for (const status of ['processing', 'succeeded', 'requires_capture'] as const) test(`an authoritative ${status} payment prevents automatic voiding and credit release`, async () => {
    const value = await fixture(); value.intent.status = status;
    if (status === 'succeeded') value.intent.amount_received = 1200;
    await assert.rejects(value.run(), /payment.*confirm|usage will resume/);
    assert.equal(value.state.voids, 0); assert.equal(value.heldCredit().state, 'reserved');
    assert.equal(value.database.user().billingAccount!.fundingLots.base.creditedMicros, 8_000_000);
});

test('partial or foreign payments, missing payment proof and unrelated service debt cannot be bypassed', async () => {
    for (const change of ['partial', 'foreign', 'missing', 'extra-payment', 'debt'] as const) {
        const value = await fixture();
        if (change === 'partial') value.invoice.amount_paid = 1;
        if (change === 'foreign') value.intent.customer = 'cus_foreign';
        if (change === 'missing') value.payments.length = 0;
        if (change === 'extra-payment') value.payments.push({ ...value.payment, id: 'inpay_other', is_default: false });
        if (change === 'debt') value.stripe.invoiceValues.set('in_other_debt', { id: 'in_other_debt', customer: 'cus_owner', status: 'open', amount_remaining: 1 } as Stripe.Invoice);
        await assert.rejects(value.run(), error => error instanceof Error, change);
        assert.equal(value.state.voids, 0, change); assert.equal(value.heldCredit().state, 'reserved', change);
    }
});

test('a paid invoice switches to fulfillment without canceling it or releasing the reserved credit', async () => {
    const value = await fixture(); value.invoice.status = 'paid'; value.invoice.amount_paid = 1200;
    await assert.rejects(value.run(), /paid plan finishes activating/);
    assert.equal(value.state.voids, 0); assert.equal(value.heldCredit().state, 'reserved');
    assert.equal(value.savedOperation().state, 'draining'); assert.equal(value.database.user().billingOperation?.sourcePlanUsable, undefined);
});

test('payment winning the void race retains the financial hold until paid fulfillment', async () => {
    const value = await fixture(); value.state.payDuringVoid = true;
    await assert.rejects(value.run(), /paid before voiding/);
    assert.equal(value.invoice.status, 'paid'); assert.equal(value.heldCredit().state, 'reserved');
    assert.equal(value.savedOperation().sourceUsageCancellation?.paymentIntentIds[0], value.intent.id);
    await assert.rejects(value.run(), /paid plan finishes activating/);
    assert.equal(value.state.voids, 1); assert.equal(value.heldCredit().state, 'reserved');
});

test('a lost void response recovers its terminal proof without another void or duplicated reservation', async () => {
    const value = await fixture(); value.state.loseVoidResponse = true;
    await assert.rejects(value.run(), /Void response lost/);
    assert.equal(value.invoice.status, 'void'); assert.equal(value.heldCredit().state, 'reserved');
    await value.run(); await value.run();
    assert.equal(value.state.voids, 1); assert.equal(value.heldCredit().state, 'released');
    assert.equal(Object.keys(value.database.user().billingAccount!.reservations).length, 1);
});

test('an open post-void link requires the same recorded complete intent set and zero received money', async () => {
    for (const change of ['missing-marker', 'new-intent', 'paid-link', 'unknown-link', 'received-money'] as const) {
        const value = await fixture(); value.state.loseVoidResponse = true;
        await assert.rejects(value.run(), /Void response lost/);
        assert.equal(value.invoice.status, 'void'); assert.equal(value.intent.status, 'canceled');
        if (change === 'missing-marker') delete value.savedOperation().sourceUsageCancellation;
        if (change === 'new-intent') { value.intent.id = 'pi_unexpected'; value.payment.payment.payment_intent = value.intent.id; }
        if (change === 'paid-link') value.payment.status = 'paid';
        if (change === 'unknown-link') value.payment.status = 'unknown_status';
        if (change === 'received-money') value.intent.amount_received = 1;
        await assert.rejects(value.run(), error => error instanceof Error, change);
        assert.equal(value.heldCredit().state, 'reserved', change);
        assert.equal(value.state.voids, 1, 'An uncertain post-void proof never sends another cancellation');
    }
});

test('cron cancellation recovery cannot release credit while a post-void payment remains uncertain', async () => {
    const value = await fixture(); value.state.keepProcessingAfterVoid = true;
    await assert.rejects(value.run(), /payment.*confirm/);
    assert.equal(value.invoice.status, 'void'); assert.equal(value.heldCredit().state, 'reserved');
    await assert.rejects(advancePlanChange('upgrade', value.deps), /payment.*confirm/);
    assert.equal(value.heldCredit().state, 'reserved');
    value.intent.status = 'canceled'; value.payment.status = 'canceled';
    await advancePlanChange('upgrade', value.deps);
    assert.equal(value.heldCredit().state, 'released'); assert.equal(value.database.user().planKey, 'standard');
    assert.match(value.savedOperation().error!, /current paid plan.*fresh upgrade quote/);
});

test('the existing confirmation API recovers interrupted canceled cleanup and preserves its source-usage explanation', async () => {
    const value = await fixture(); value.state.keepProcessingAfterVoid = true;
    await assert.rejects(value.run(), /payment.*confirm/);
    await assert.rejects(advancePlanChange('upgrade', value.deps), /payment.*confirm/);
    assert.equal(value.savedOperation().state, 'canceled');
    assert.equal(value.database.user().billingOperation?.state, 'canceled');
    assert.equal(value.heldCredit().state, 'reserved');
    assert.throws(() => reserveCost(getBillingAccount(value.database.user()), value.database.user(), request), /spending is paused/);
    value.intent.status = 'canceled';
    assert.equal(value.payment.status, 'open', 'The authoritative canceled PI proves the real Stripe shape');
    const result = await applyPlanChange('owner', 'upgrade', false, value.deps);
    assert.equal(result.state, 'canceled'); assert.match(result.error!, /current paid plan.*fresh upgrade quote/);
    assert.equal(value.heldCredit().state, 'released'); assert.equal(value.database.user().billingOperation, undefined);
    assert.equal((await value.run()).state, 'reserved'); assert.equal(value.state.voids, 1);
});

test('a newer customer generation invalidates conditional cancellation before any mutation', async () => {
    const value = await fixture();
    let conflict: PendingPlanCreditBlocksUsageError | undefined;
    try { reserveCost(getBillingAccount(value.database.user()), value.database.user(), request); }
    catch (error) { assert.ok(error instanceof PendingPlanCreditBlocksUsageError); conflict = error; }
    assert.ok(conflict);
    value.database.user().stripeCustomerGeneration = 1;
    await assert.rejects(value.recover(conflict), /source plan.*confirmed/);
    assert.equal(value.state.voids, 0); assert.equal(value.heldCredit().state, 'reserved');
});

test('admission retries at most once instead of recursively canceling further offers', async () => {
    const value = await fixture(); let recoveries = 0, attempts = 0;
    await assert.rejects(mutateUsageBillingAccount('owner', (account, user) => { attempts++; return reserveCost(account, user, request); }, value.deps.db,
        async () => { recoveries++; }), PendingPlanCreditBlocksUsageError);
    assert.equal(attempts, 2); assert.equal(recoveries, 1); assert.equal(value.state.voids, 0);
});

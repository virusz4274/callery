import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { ensureRecurringUsageBilling } from './bootstrap';
import { getBillingAccount } from './ledger';
import { transferFixture, rolloutTariffs } from './grant-transfer.test-support';
import { FakeBillingStripe, clone, planFixture } from './test-support';

function fixture() {
    const value = transferFixture(), target = rolloutTariffs('returning'), validation = new FakeBillingStripe();
    const plan = planFixture({ usageTariffs: target, stripeStoragePriceId: target.storage.priceId, stripeTranscriptionPriceId: target.transcription.priceId });
    const subscription = { id: 'sub_returning', customer: 'cus_owner', currency: 'usd', status: 'active', billing_mode: { type: 'flexible' },
        latest_invoice: 'in_returning_paid', items: { data: [], has_more: false } } as unknown as Stripe.Subscription;
    value.stripe.subscriptionValues.set(subscription.id, subscription);
    value.stripe.invoiceValues.set('in_returning_paid', { id: 'in_returning_paid', status: 'paid' } as Stripe.Invoice);
    Object.assign(value.memory.user(), { stripeSubscriptionId: 'sub_previous', stripeSubscriptionStatus: 'canceled' });
    const prices = Object.fromEntries((['storage', 'transcription'] as const).map(kind => [target[kind].priceId, {
        ...validation.priceValues.get(`price_${kind}`), id: target[kind].priceId,
        recurring: { usage_type: 'metered', meter: target[kind].meterId, interval: 'month', interval_count: 1 },
    }]));
    let attachments = 0;
    const stripe = { ...value.stripe,
        prices: { retrieve: async (id: string) => clone(prices[id]) },
        billing: { ...value.stripe.billing, meters: validation.billing.meters },
        subscriptions: { ...value.stripe.subscriptions, update: async (_id: string, params: Stripe.SubscriptionUpdateParams) => {
            const replacement = [...value.stripe.grants.values()].find(grant => grant.id !== 'cg_original');
            assert.ok(value.stripe.grants.get('cg_original')!.expires_at);
            assert.ok(replacement?.applicability_config.scope.prices?.some(price => price.id === target.storage.priceId));
            attachments++;
            subscription.items.data = params.items!.map(item => ({ id: `si_${item.price}`, price: prices[item.price!],
                current_period_start: 1790812800, current_period_end: 1793491200 } as Stripe.SubscriptionItem));
            return clone(subscription);
        } },
    } as unknown as Stripe;
    return { ...value, target, plan, subscription, runtime: { db: value.memory.asDb(), stripe }, attachments: () => attachments };
}

test('returning Checkout prepares retained credit for new prices before activating meters, including lost-response recovery', async () => {
    const value = fixture(), original = getBillingAccount(value.memory.user());
    value.stripe.loseCreate = true;
    await assert.rejects(ensureRecurringUsageBilling('owner', value.subscription.id, value.plan, value.runtime), /response lost/);
    assert.ok(value.memory.user().billingGrantTransfer);
    assert.equal(value.attachments(), 0);
    assert.equal(value.subscription.items.data.length, 0);
    await ensureRecurringUsageBilling('owner', value.subscription.id, value.plan, value.runtime);
    await ensureRecurringUsageBilling('owner', value.subscription.id, value.plan, value.runtime);
    assert.equal(value.stripe.createCalls, 1);
    assert.equal(value.attachments(), 1);
    assert.equal(value.memory.user().billingGrantTransfer, undefined);
    assert.equal(value.memory.user().usageBillingBootstrap?.state, 'ready');
    assert.deepEqual(getBillingAccount(value.memory.user()), original);
});

test('unproven retained-credit transfer cannot enable replacement meter prices', async () => {
    const value = fixture(); value.stripe.omitExpiryDebit = true;
    await assert.rejects(ensureRecurringUsageBilling('owner', value.subscription.id, value.plan, value.runtime), /exact expired-credit debit/);
    assert.ok(value.memory.user().billingGrantTransfer);
    assert.equal(value.attachments(), 0);
    assert.equal(value.stripe.createCalls, 0);
    assert.equal(value.memory.user().usageBillingBootstrap, undefined);
});

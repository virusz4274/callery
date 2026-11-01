import test from 'node:test';
import assert from 'node:assert/strict';
import { withBillingLease } from './billing-lock';
import { cancelPlanChange, advancePlanChange } from './plan-change';
import { composeBillingPhases, coordinateBillingSchedule, syncScheduledBillingBoundary, releaseScheduleForPaidUpgrade,
    shouldSyncScheduledBillingBoundary, BillingSyncPendingError } from './subscription-schedule';
import { scheduleFixture } from './subscription-schedule.test-support';
import { scheduleCatalogUsageRollouts, processUsagePriceRollouts } from './usage-price-rollout';
import { clone } from './test-support';
import type Stripe from 'stripe';

const preparedAt = new Date('2026-10-22'), boundary = new Date('2026-12-01');
const prepare = (value: ReturnType<typeof scheduleFixture>) => withBillingLease(value.runtime.db, 'owner', (user, owner) => coordinateBillingSchedule(user, owner, value.runtime, preparedAt));

test('one schedule combines a downgrade and repricing at the same boundary and preserves physical meter roles', () => {
    const value = scheduleFixture();
    value.subscription.items.data.reverse();
    const phases = composeBillingPhases(value.subscription, [{ at: boundary.getTime() / 1000, plan: value.standard, tariffs: value.target }], undefined, value.tariffs);
    assert.equal(phases.length, 2);
    assert.deepEqual(phases[1].items.map(item => item.price), ['price_new_transcription', 'price_new_storage', 'price_base']);
    assert.equal(phases[0].proration_behavior, 'none'); assert.equal(phases[1].proration_behavior, 'none');
    assert.equal(phases[1].billing_cycle_anchor, 'automatic');
});

test('phase composition retains taxes, discounts, payment method and annual billing anchor behavior', () => {
    const value = scheduleFixture();
    value.subscription.items.data[0].price.recurring!.interval = 'year';
    Object.assign(value.subscription, { default_payment_method: 'pm_saved', default_tax_rates: [{ id: 'txr_original' }], discounts: ['di_existing'],
        automatic_tax: { enabled: true } });
    const phases = composeBillingPhases(value.subscription, [{ at: boundary.getTime() / 1000, tariffs: value.target }], undefined, value.tariffs);
    for (const phase of phases) {
        assert.equal(phase.default_payment_method, 'pm_saved'); assert.deepEqual(phase.default_tax_rates, ['txr_original']);
        assert.deepEqual(phase.discounts, [{ discount: 'di_existing' }]); assert.deepEqual(phase.automatic_tax, { enabled: true });
        assert.equal(phase.billing_cycle_anchor, 'automatic');
    }
});

test('preparation creates one durable Stripe schedule without changing current paid service', async () => {
    const value = scheduleFixture(); value.addDowngrade(); value.addRollout();
    await prepare(value); await prepare(value);
    assert.equal(value.state.creates, 1); assert.equal(value.subscription.items.data[0].price.id, 'price_pro');
    assert.equal(value.memory.user().planKey, 'pro'); assert.equal(value.memory.user().billingSchedule?.effectiveAt?.toISOString(), boundary.toISOString());
    assert.equal(value.schedules.get('sub_sched_1')?.phases.length, 2);
    assert.equal(value.stripe.expireCalls, 0); assert.equal(value.stripe.createCalls, 0);
});

test('Stripe applies a prepared phase without cron; late reconciliation adopts allowance and prices together', async () => {
    const value = scheduleFixture(); value.addDowngrade(); value.addRollout();
    const consumed = value.memory.user().transcriptionUsed, account = clone(value.memory.user().billingAccount);
    await prepare(value); value.advance(boundary);
    assert.equal(value.memory.user().planKey, 'pro');
    await syncScheduledBillingBoundary('owner', value.runtime, new Date('2026-12-03'));
    assert.equal(value.memory.user().planKey, 'standard'); assert.equal(value.memory.user().storageAllocation, 200);
    assert.equal(value.memory.user().transcriptionAllocation, 600); assert.deepEqual(value.memory.user().billingUsageTariffs, value.target);
    assert.equal(value.memory.user().transcriptionUsed, consumed); assert.deepEqual(value.memory.user().billingAccount, account);
    assert.equal(value.memory.collection('billing_operations').values[0].state, 'applied');
    assert.equal(value.memory.collection('billing_usage_price_rollouts').values[0].state, 'applied');
    assert.equal(shouldSyncScheduledBillingBoundary(value.memory.user(), boundary), false);
    await syncScheduledBillingBoundary('owner', value.runtime, new Date('2026-12-04'));
    assert.equal(value.state.creates, 1);
});

test('unconfirmed remote phases report billing_sync_pending without changing paid entitlements', async () => {
    const value = scheduleFixture(); value.addDowngrade(); await prepare(value);
    await assert.rejects(syncScheduledBillingBoundary('owner', value.runtime, boundary), BillingSyncPendingError);
    assert.equal(value.memory.user().planKey, 'pro'); assert.equal(value.memory.user().billingRecovery, undefined);
});

test('a draft downgrade renewal cannot grant its new included allowance before authoritative payment', async () => {
    const value = scheduleFixture(); value.addDowngrade(); value.addRollout(); await prepare(value); value.advance(boundary, false);
    await assert.rejects(syncScheduledBillingBoundary('owner', value.runtime, boundary), BillingSyncPendingError);
    assert.equal(value.memory.user().planKey, 'pro'); assert.equal(value.memory.user().billingRecovery, undefined);
    const invoice = value.stripe.invoiceValues.get('in_renewal')!; invoice.status = 'paid'; invoice.amount_paid = 1000; invoice.amount_remaining = 0;
    await syncScheduledBillingBoundary('owner', value.runtime, boundary);
    assert.equal(value.memory.user().planKey, 'standard'); assert.equal(value.memory.user().billingPaidBasePeriod?.invoiceId, invoice.id);
});

test('a legitimate Stripe zero-balance renewal supplies paid service proof without a card charge', async () => {
    const value = scheduleFixture(); value.addDowngrade(); await prepare(value); value.advance(boundary);
    Object.assign(value.stripe.invoiceValues.get('in_renewal')!, { amount_due: 0, amount_paid: 0, amount_remaining: 0 });
    await syncScheduledBillingBoundary('owner', value.runtime, boundary);
    assert.equal(value.memory.user().planKey, 'standard'); assert.equal(value.memory.user().billingPaidBasePeriod?.invoiceId, 'in_renewal');
});

test('lost schedule create and update responses recover the same owned subscription schedule', async () => {
    for (const loss of ['loseCreate', 'loseUpdate'] as const) {
        const value = scheduleFixture(); value.addDowngrade(); value.state[loss] = true;
        await assert.rejects(prepare(value), /response lost/);
        await prepare(value);
        assert.equal(value.state.creates, 1); assert.equal(value.memory.user().billingSchedule?.state, 'scheduled');
        assert.equal(value.memory.user().planKey, 'pro');
    }
});

test('a Stripe phase committed before the local scheduled checkpoint is recovered at its boundary', async () => {
    const value = scheduleFixture(); value.addDowngrade(); value.addRollout(); value.state.loseUpdate = true;
    await assert.rejects(prepare(value), /response lost/);
    assert.equal(value.memory.collection('billing_subscription_schedules').values[0].state, 'preparing');
    value.advance(boundary);
    await syncScheduledBillingBoundary('owner', value.runtime, boundary);
    assert.equal(value.memory.user().planKey, 'standard'); assert.deepEqual(value.memory.user().billingUsageTariffs, value.target);
    assert.equal(value.memory.collection('billing_subscription_schedules').values[0].state, 'scheduled');
});

test('canceling a downgrade preserves an independently noticed usage-price change', async () => {
    const value = scheduleFixture(); const downgrade = value.addDowngrade(); value.addRollout(); await prepare(value);
    await cancelPlanChange('owner', downgrade._id, value.runtime);
    assert.equal(value.memory.collection('billing_operations').values[0].state, 'canceled');
    const future = value.schedules.get('sub_sched_1')!.phases[1];
    assert.ok(future.items.some(item => String(item.price) === 'price_pro'));
    assert.ok(future.items.some(item => String(item.price) === 'price_new_storage'));
});

test('a lost downgrade-cancellation response remains recoverable until Stripe schedule reconciliation completes', async () => {
    const value = scheduleFixture(); const operation = value.addDowngrade(); value.addRollout(); await prepare(value);
    value.state.loseUpdate = true;
    await assert.rejects(cancelPlanChange('owner', operation._id, value.runtime), /response lost/);
    let stored = value.memory.collection('billing_operations').values[0];
    assert.equal(stored.state, 'canceled'); assert.equal(stored.scheduleCancellationPending, true); assert.equal(stored.cleanupCompletedAt, undefined);
    await advancePlanChange(operation._id, value.runtime);
    stored = value.memory.collection('billing_operations').values[0];
    assert.equal(stored.scheduleCancellationPending, false); assert.ok(stored.cleanupCompletedAt);
    assert.ok(value.schedules.get('sub_sched_1')!.phases[1].items.some(item => String(item.price) === 'price_pro'));
});

test('a paid upgrade releases its old schedule and cancels only its pending downgrade', async () => {
    const value = scheduleFixture(); value.addDowngrade(); value.addRollout(); await prepare(value);
    await withBillingLease(value.runtime.db, 'owner', (user, owner) => releaseScheduleForPaidUpgrade(user, owner, value.runtime));
    assert.equal(value.state.releases, 1); assert.equal(value.subscription.schedule, null);
    assert.equal(value.memory.collection('billing_operations').values[0].state, 'canceled');
    assert.equal(value.memory.collection('billing_usage_price_rollouts').values[0].state, 'scheduled');
});

test('an external schedule is not overwritten by the application', async () => {
    const value = scheduleFixture(); value.addDowngrade();
    value.subscription.schedule = 'external';
    value.schedules.set('external', { id: 'external', customer: 'cus_owner', subscription: 'sub_owner', metadata: { foreign: 'yes' }, phases: [] } as unknown as Stripe.SubscriptionSchedule);
    await assert.rejects(prepare(value), /outside the application/); assert.equal(value.state.updates, 0);
});

test('external edits to prepared phase items cannot be adopted just because their metadata is unchanged', async () => {
    const value = scheduleFixture(); value.addDowngrade(); await prepare(value);
    value.schedules.get('sub_sched_1')!.phases[1].items[0].price = 'price_external'; value.advance(boundary);
    await assert.rejects(syncScheduledBillingBoundary('owner', value.runtime, boundary), BillingSyncPendingError);
    assert.equal(value.memory.user().planKey, 'pro');
});

test('closed-account tombstones cancel scheduled changes without restoring paid access or stranding settlement', async () => {
    const value = scheduleFixture(); const operation = value.addDowngrade(); value.addRollout(); await prepare(value);
    const tombstone = value.memory.collection('users').values.shift()!; tombstone.disabled = true;
    value.memory.collection('billing_deleted_accounts').values.push(tombstone);
    const closed = await advancePlanChange(operation._id, value.runtime);
    assert.equal(closed.state, 'canceled'); assert.ok(closed.cleanupCompletedAt); assert.equal(value.state.releases, 1);
    assert.equal(value.memory.collection('billing_deleted_accounts').values[0].billingSchedule, undefined);
    assert.equal(value.memory.collection('billing_deleted_accounts').values[0].disabled, true);
    assert.equal(value.memory.collection('billing_usage_price_rollouts').values[0].state, 'canceled');
});

test('new repricing prepares Stripe phases after successful notice without grant transfers or a 24-hour lead', async () => {
    const value = scheduleFixture();
    value.memory.collection('billing_catalog_bundles').values.push({ _id: 'bundle_new', state: 'published', plans: [{ plan: value.standard, usageTariffs: value.target, catalogVersion: 'new:standard' }] });
    let now = new Date('2026-10-21T12:00:00Z');
    const runtime = { ...value.runtime, now: () => now, sendEmail: async () => true };
    assert.equal(await scheduleCatalogUsageRollouts(undefined, 'bundle_new', runtime), 1);
    await processUsagePriceRollouts(runtime);
    now = new Date('2026-11-30T12:00:00Z');
    await processUsagePriceRollouts(runtime);
    const row = value.memory.collection('billing_usage_price_rollouts').values[0];
    assert.equal(row.state, 'prepared'); assert.equal(value.state.creates, 1); assert.equal(value.stripe.expireCalls, 0);
    value.advance(boundary); now = new Date('2026-12-02'); await processUsagePriceRollouts(runtime);
    assert.equal(value.memory.collection('billing_usage_price_rollouts').values[0].state, 'applied');
});

test('legacy exact-scope credit defers replacement without expiring or reissuing customer funds', async () => {
    const value = scheduleFixture(true); value.addRollout();
    await processUsagePriceRollouts({ ...value.runtime, now: () => preparedAt });
    const row = value.memory.collection('billing_usage_price_rollouts').values[0];
    assert.equal(row.state, 'scheduled'); assert.match(String(row.lastError), /Legacy prepaid/);
    assert.equal(value.stripe.expireCalls, 0); assert.equal(value.stripe.createCalls, 0); assert.equal(value.state.creates, 0);
});

test('a broad metered grant covers future usage Prices without changing its paid principal', async () => {
    const value = scheduleFixture(true); value.addRollout();
    value.stripe.grants.get('cg_original')!.applicability_config.scope = { price_type: 'metered' };
    const funded = value.memory.user().billingAccount!.prepaidFundedMicros;
    await prepare(value);
    assert.equal(value.state.creates, 1); assert.equal(value.stripe.createCalls, 0); assert.equal(value.stripe.expireCalls, 0);
    assert.equal(value.memory.user().billingAccount!.prepaidFundedMicros, funded);
});

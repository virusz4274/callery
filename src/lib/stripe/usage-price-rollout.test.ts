import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleCatalogUsageRollouts as createRollouts, processUsagePriceRollouts, nextNoticedUsageBoundary, USAGE_PRICE_ROLLOUTS, type UsagePriceRollout } from './usage-price-rollout';
import { rolloutTariffs, transferFixture } from './grant-transfer.test-support';
import type { BillingCatalogBundle } from './catalog-bundle';
import { planFixture } from './test-support';
import { GRANT_TRANSFERS } from './grant-transfer';

// These cases preserve recovery for already-accepted legacy transfer phases.
// New schedule-based rollouts are covered by subscription-schedule.test.ts.
async function scheduleCatalogUsageRollouts(...args: Parameters<typeof createRollouts>) {
    const result = await createRollouts(...args);
    const rows = await args[2]!.db.collection<UsagePriceRollout>(USAGE_PRICE_ROLLOUTS).find({}).toArray();
    for (const row of rows) await args[2]!.db.collection<UsagePriceRollout>(USAGE_PRICE_ROLLOUTS).updateOne({ _id: row._id }, { $unset: { scheduleCoordinator: '' } });
    return result;
}

function setup(withFunds = false) {
    const value = transferFixture(withFunds), target = rolloutTariffs('new');
    const bundle = { _id: 'bundle_new', schemaVersion: 1, state: 'published', plans: [{ plan: planFixture(), usageTariffs: target, catalogVersion: 'bundle_new:standard' }] } as BillingCatalogBundle;
    value.memory.collection('billing_catalog_bundles').values.push(bundle as unknown as Record<string, unknown>);
    let now = new Date('2026-10-21T12:00:00Z'), emails = 0, emailAvailable = true;
    const runtime = { ...value.runtime, now: () => now, sendEmail: async () => { emails++; return emailAvailable; } };
    return { ...value, target, runtime, setNow: (date: string) => { now = new Date(date); }, emails: () => emails, setEmail: (available: boolean) => { emailAvailable = available; },
        job: () => value.memory.collection(USAGE_PRICE_ROLLOUTS).values[0] as unknown as UsagePriceRollout };
}
test('monthly usage prices wait 30 days after both successful notices, without changing the base purchase', async () => {
    const value = setup(), { runtime, memory, user, stripe, target } = value;
    const basePrice = user.stripePriceId, purchaseCatalog = user.billingCatalogVersion;
    assert.equal(await scheduleCatalogUsageRollouts('bundle_old', 'bundle_new', runtime), 1);
    assert.equal(await scheduleCatalogUsageRollouts('bundle_old', 'bundle_new', runtime), 0);
    await processUsagePriceRollouts(runtime);
    const job = value.job();
    assert.equal(job.state, 'scheduled');
    assert.ok(job.emailSentAt && job.inAppNotifiedAt && job.noticedAt);
    assert.equal(job.effectiveAt!.toISOString(), '2026-12-01T00:00:00.000Z');
    assert.ok(job.effectiveAt!.getTime() - job.noticedAt!.getTime() >= 30 * 86400_000);
    assert.equal(memory.collection('notifications').values.length, 1);
    assert.equal(value.emails(), 1); assert.equal(stripe.subscriptionUpdates, 0);
    value.setNow('2026-10-22T12:00:00Z'); await processUsagePriceRollouts(runtime);
    assert.equal(value.job().state, 'prepared');
    value.setNow('2026-11-30T23:59:59Z'); await processUsagePriceRollouts(runtime);
    assert.equal(stripe.subscriptionUpdates, 0);
    for (const item of stripe.subscriptionValues.get('sub_owner')!.items.data) {
        item.current_period_start = Date.parse('2026-12-01') / 1000; item.current_period_end = Date.parse('2027-01-01') / 1000;
    }
    value.setNow('2026-12-01T00:00:00Z'); await processUsagePriceRollouts(runtime);
    assert.equal(value.job().state, 'applied'); assert.equal(stripe.subscriptionUpdates, 1);
    assert.deepEqual(memory.user().billingUsageTariffs, target);
    assert.equal(memory.user().billingUsageCatalogVersion, 'bundle_new:standard');
    assert.equal(memory.user().stripePriceId, basePrice); assert.equal(memory.user().billingCatalogVersion, purchaseCatalog);
    await processUsagePriceRollouts(runtime); assert.equal(stripe.subscriptionUpdates, 1);
});
test('a skipped or failed email never starts the 30-day activation clock', async () => {
    const value = setup(); value.setEmail(false);
    await scheduleCatalogUsageRollouts(undefined, 'bundle_new', value.runtime);
    await processUsagePriceRollouts(value.runtime);
    assert.equal(value.job().state, 'notifying'); assert.equal(value.job().noticedAt, undefined);
    value.setNow('2026-12-02T12:00:00Z'); value.setEmail(true);
    await processUsagePriceRollouts(value.runtime);
    assert.equal(value.job().effectiveAt!.toISOString(), '2027-02-01T00:00:00.000Z');
    assert.equal(value.stripe.subscriptionUpdates, 0);
});
test('missing the 24-hour grant preparation lead defers the change for a complete usage window', async () => {
    const value = setup(); await scheduleCatalogUsageRollouts(undefined, 'bundle_new', value.runtime); await processUsagePriceRollouts(value.runtime);
    value.setNow('2026-11-30T12:00:00Z'); const result = await processUsagePriceRollouts(value.runtime);
    assert.equal(result.deferred, 1); assert.equal(value.job().effectiveAt!.toISOString(), '2027-01-01T00:00:00.000Z');
    assert.equal(value.stripe.subscriptionUpdates, 0);
});
test('accepted work at the boundary defers activation instead of repricing its receipt or resetting allowance', async () => {
    const value = setup(); await scheduleCatalogUsageRollouts(undefined, 'bundle_new', value.runtime); await processUsagePriceRollouts(value.runtime);
    value.setNow('2026-10-22T12:00:00Z'); await processUsagePriceRollouts(value.runtime);
    value.memory.collection('usage_events').values.push({ _id: 'pending', authSubject: 'owner', value: 1, processingStatus: 'accepted' });
    value.setNow('2026-12-01T00:00:00Z'); await processUsagePriceRollouts(value.runtime);
    assert.equal(value.job().state, 'prepared'); assert.equal(value.job().effectiveAt!.toISOString(), '2027-01-01T00:00:00.000Z');
    assert.equal(value.stripe.subscriptionUpdates, 0);
    assert.deepEqual(value.memory.user().billingUsageTariffs, value.tariffs);
});
test('customer deletion cancels notices without creating any new subscription prices', async () => {
    const value = setup(); await scheduleCatalogUsageRollouts(undefined, 'bundle_new', value.runtime);
    value.memory.user().disabled = true;
    await processUsagePriceRollouts(value.runtime);
    assert.equal(value.job().state, 'canceled'); assert.equal(value.emails(), 0); assert.equal(value.stripe.subscriptionUpdates, 0);
});
test('erasure after expiry finishes the financial replacement before canceling price activation', async () => {
    const value = setup(true); await scheduleCatalogUsageRollouts(undefined, 'bundle_new', value.runtime); await processUsagePriceRollouts(value.runtime);
    value.stripe.loseCreate = true; value.setNow('2026-10-22T12:00:00Z');
    await processUsagePriceRollouts(value.runtime);
    assert.equal(value.job().state, 'preparing'); assert.ok(value.memory.user().billingGrantTransfer);
    const erased = value.memory.collection('users').values.shift()!; erased.disabled = true; delete erased.email;
    value.memory.collection('billing_deleted_accounts').values.push(erased);
    await processUsagePriceRollouts(value.runtime);
    assert.equal(value.job().state, 'canceled');
    assert.equal(value.memory.collection('billing_deleted_accounts').values[0].billingGrantTransfer, undefined);
    assert.equal(value.memory.collection('users').values.length, 0);
    assert.equal(value.stripe.createCalls, 1); assert.equal(value.stripe.subscriptionUpdates, 0);
});
test('price notice boundaries retain their original month-end day', () => {
    assert.equal(nextNoticedUsageBoundary(new Date('2026-01-31T12:00:00Z'), new Date('2026-03-01'), 31).toISOString(), '2026-03-31T12:00:00.000Z');
});
test('a customer generation change prevents mutation of another customer account', async () => {
    const value = setup(); await scheduleCatalogUsageRollouts(undefined, 'bundle_new', value.runtime);
    value.memory.user().stripeCustomerGeneration = 1;
    await processUsagePriceRollouts(value.runtime);
    assert.equal(value.job().state, 'needs_review'); assert.equal(value.stripe.subscriptionUpdates, 0);
    assert.equal(value.memory.collection(GRANT_TRANSFERS).values.length, 0);
});
test('multiple publications serialize changes and notice the latest bundle after the first activates', async () => {
    const value = setup();
    const latest = rolloutTariffs('latest');
    value.memory.collection('billing_catalog_bundles').values.push({ _id: 'bundle_latest', state: 'published', plans: [{ plan: planFixture(), usageTariffs: latest, catalogVersion: 'bundle_latest:standard' }] });
    await scheduleCatalogUsageRollouts(undefined, 'bundle_new', value.runtime);
    assert.equal(await scheduleCatalogUsageRollouts('bundle_new', 'bundle_latest', value.runtime), 0);
    await processUsagePriceRollouts(value.runtime);
    value.setNow('2026-10-22'); await processUsagePriceRollouts(value.runtime);
    for (const item of value.stripe.subscriptionValues.get('sub_owner')!.items.data) {
        item.current_period_start = Date.parse('2026-12-01') / 1000; item.current_period_end = Date.parse('2027-01-01') / 1000;
    }
    value.setNow('2026-12-01'); await processUsagePriceRollouts(value.runtime);
    value.memory.collection('billing_catalog_state').values.push({ _id: 'active', bundleId: 'bundle_latest', revision: 2 });
    await processUsagePriceRollouts(value.runtime);
    const followup = value.memory.collection(USAGE_PRICE_ROLLOUTS).values[1] as unknown as UsagePriceRollout;
    assert.equal(followup.targetBundleId, 'bundle_latest'); assert.equal(followup.state, 'scheduled');
    assert.deepEqual(followup.sourceTariffs, value.target);
    assert.ok(followup.effectiveAt!.getTime() - followup.noticedAt!.getTime() >= 30 * 86400_000);
});
test('republishing historical bundles creates a new noticed transition for each publication identity', async () => {
    const value = setup();
    value.memory.collection('billing_catalog_bundles').values.push({ _id: 'bundle_old', state: 'published', plans: [{ plan: planFixture(), usageTariffs: value.tariffs, catalogVersion: 'bundle_old:standard' }] });
    for (const [bundleId, publicationId] of [['bundle_new', 'publication:1'], ['bundle_old', 'publication:2'], ['bundle_new', 'publication:3']]) {
        assert.equal(await scheduleCatalogUsageRollouts(undefined, bundleId, value.runtime, publicationId), 1);
        await processUsagePriceRollouts(value.runtime);
        const job = value.memory.collection(USAGE_PRICE_ROLLOUTS).values.at(-1) as unknown as UsagePriceRollout;
        assert.equal(job.publicationId, publicationId);
        assert.ok(job.effectiveAt!.getTime() - job.noticedAt!.getTime() >= 30 * 86400_000);
        value.setNow(new Date(job.noticedAt!.getTime() + 86400_000).toISOString()); await processUsagePriceRollouts(value.runtime);
        for (const item of value.stripe.subscriptionValues.get('sub_owner')!.items.data) {
            item.current_period_start = job.effectiveAt!.getTime() / 1000;
            item.current_period_end = job.effectiveAt!.getTime() / 1000 + 31 * 86400;
        }
        value.setNow(job.effectiveAt!.toISOString()); await processUsagePriceRollouts(value.runtime);
        assert.equal(job.state, 'applied');
        assert.equal(value.memory.user().billingUsageCatalogVersion, `${bundleId}:standard`);
    }
    assert.equal(value.stripe.subscriptionUpdates, 3); assert.equal(value.emails(), 3);
    assert.equal(value.memory.collection(USAGE_PRICE_ROLLOUTS).values.length, 3);
});
test('even a submicrodollar storage quantity already accounted in the new window defers activation', async () => {
    const value = setup(); await scheduleCatalogUsageRollouts(undefined, 'bundle_new', value.runtime); await processUsagePriceRollouts(value.runtime);
    value.setNow('2026-10-22'); await processUsagePriceRollouts(value.runtime);
    const period = value.memory.user().billingAccount!.periods.period;
    period.start = new Date('2026-12-01'); period.end = new Date('2027-01-01');
    period.usageAmounts = { submicro: { quantity: 1, grossEarnedMicros: 0 } } as never;
    value.setNow('2026-12-01'); await processUsagePriceRollouts(value.runtime);
    assert.equal(value.stripe.subscriptionUpdates, 0); assert.equal(value.job().effectiveAt!.toISOString(), '2027-01-01T00:00:00.000Z');
});
test('missing the monthly boundary never applies a new tariff in the middle of a window', async () => {
    const value = setup(); await scheduleCatalogUsageRollouts(undefined, 'bundle_new', value.runtime); await processUsagePriceRollouts(value.runtime);
    value.setNow('2026-10-22'); await processUsagePriceRollouts(value.runtime);
    value.setNow('2026-12-05'); await processUsagePriceRollouts(value.runtime);
    assert.equal(value.stripe.subscriptionUpdates, 0); assert.equal(value.job().effectiveAt!.toISOString(), '2027-01-01T00:00:00.000Z');
});

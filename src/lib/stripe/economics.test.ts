import test from 'node:test';
import assert from 'node:assert/strict';
import { assertUsageCostMargin, estimateUsageFees, usageEconomics, type ManagedCostPolicy } from './economics';
import { fixtureUsageTariffs } from './test-support';

const policy = { paymentFeeBasisPoints: 300, paymentFixedMicros: 300_000, minimumTopupMicros: 5_000_000,
    stripeBillingFeeBasisPoints: 70 } as ManagedCostPolicy;

test('usage fees apply only to the chargeable quantity and reserve no usage fees for included work', () => {
    const tariff = fixtureUsageTariffs().transcription;
    assert.deepEqual(estimateUsageFees(tariff, 0, policy), { nominalRetailMicros: 0, feeBudgetMicros: 0,
        billingFeeBudgetMicros: 0, processorFeeBudgetMicros: 0 });
    const partial = estimateUsageFees(tariff, 4, policy), full = estimateUsageFees(tariff, 12, policy);
    assert.equal(partial.nominalRetailMicros, 10_000); assert.equal(full.nominalRetailMicros, 30_000);
    assert.equal(partial.billingFeeBudgetMicros, 70); assert.equal(partial.processorFeeBudgetMicros, 900);
    assert.equal(full.feeBudgetMicros, partial.feeBudgetMicros * 3);
});

test('low and negative estimated contribution are advisory for both tariff families', () => {
    for (const family of ['recurring', 'lifetime'] as const) {
        const tariff = fixtureUsageTariffs(family).transcription;
        const report = usageEconomics(tariff, 4, 20_000, policy);
        assert.equal(report.contributionMicros, -10_970); assert.equal(report.contributionBps, -10_970);
        assert.deepEqual(assertUsageCostMargin(tariff, 4, 20_000, policy), report);
        assert.equal('minimumMarginBps' in report, false);
    }
});

test('missing fee evidence and invalid cost bounds remain distinct from a business margin decision', () => {
    const tariff = fixtureUsageTariffs().transcription;
    assert.throws(() => estimateUsageFees(tariff, 4, { ...policy, stripeBillingFeeBasisPoints: undefined }), /fee schedule/);
    assert.throws(() => usageEconomics(tariff, 4, Number.NaN, policy), /verified usage cost cap/);
    const noRevenue = usageEconomics(tariff, 0, 100, policy);
    assert.equal(noRevenue.contributionMicros, -100); assert.equal(noRevenue.contributionBps, undefined);
});

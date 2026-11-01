import test from 'node:test';
import assert from 'node:assert/strict';
import { accumulateUsageCharge, applyUsageInvoiceAmount, assertUsageTariff, canonicalUnitAmountDecimal, createUsageAmountAccumulator,
    createUsageTariffSnapshot, formatUsdAtoms, minimumBillableQuantity, parseUnitPriceAtoms, quoteUsageQuantity, sameUsageTariffRate, usageRoundingReserve } from './usage-tariff';

function tariff(rate: string, kind: 'storage' | 'transcription' = 'transcription', minimumChargeMicros = 0) {
    return createUsageTariffSnapshot({ catalogVersion: 'published-test-bundle', usageTier: 'lifetime', kind, priceId: `price_${kind}`, meterId: `meter_${kind}`,
        eventName: `${kind}_quantity_test`, currency: 'usd', quantityUnit: kind === 'storage' ? 'milliGiB' : 'weighted_15s_block',
        aggregation: kind === 'storage' ? 'last' : 'sum', unitAmountDecimal: rate, minimumChargeMicros });
}
test('the shared codec preserves all twelve Stripe decimal-cent digits without floating point', () => {
    assert.equal(parseUnitPriceAtoms('0.002154123456'), '2154123456');
    assert.equal(canonicalUnitAmountDecimal('000.002154123456000'), '0.002154123456');
    assert.equal(canonicalUnitAmountDecimal('1e-12'), '0.000000000001');
    assert.equal(parseUnitPriceAtoms('1e-12'), '1');
    assert.equal(canonicalUnitAmountDecimal('1.25e2'), '125');
    assert.throws(() => parseUnitPriceAtoms('1e-13'), /12 decimal/);
    for (const invalid of ['-1', '0', 'NaN', 'Infinity', '1.2.3']) assert.throws(() => parseUnitPriceAtoms(invalid));
    assert.equal(formatUsdAtoms('100000000000000'), '1');
    assert.equal(formatUsdAtoms('1'), '0.00000000000001');
});
test('realistic Lifetime storage rates retain their exact sub-microdollar unit remainder', () => {
    const rate = tariff('0.002154123456', 'storage'), quote = quoteUsageQuantity(rate, 1000);
    assert.equal(quote.exactAtoms, '2154123456000'); assert.equal(quote.floorMicros, 21541); assert.equal(quote.ceilingMicros, 21542);
    assert.equal(formatUsdAtoms(quote.exactAtoms), '0.02154123456');
});
test('recurring recording minimum rounds billing quantity up without inventing allowance consumption', () => {
    const rate = { ...tariff('0.3', 'transcription', 10_000), usageTier: 'recurring' as const };
    assert.equal(rate.minimumQuantity, 4); assert.equal(minimumBillableQuantity(rate, 1), 4);
    assert.equal(quoteUsageQuantity(rate, 4).floorMicros, 12_000);
    assert.equal(minimumBillableQuantity(rate, 0), 0);
    assert.equal(minimumBillableQuantity(tariff('0.3'), 1), 1);
});
test('fractional receipts earn only cumulative whole microdollars and reserve one invoice cent', () => {
    const bucket = createUsageAmountAccumulator(tariff('0.00006'));
    assert.equal(accumulateUsageCharge(bucket, 1).debitMicros, 0);
    assert.equal(usageRoundingReserve(bucket), 10_000);
    assert.equal(accumulateUsageCharge(bucket, 2).debitMicros, 1);
    assert.equal(usageRoundingReserve(bucket), 9999);
    assert.equal(bucket.settledExactAtoms, '120000000');
    assert.equal(accumulateUsageCharge(bucket, 2).debitMicros, 0);
    assert.throws(() => accumulateUsageCharge(bucket, 1), /cannot decrease/);
});
test('partial invoices attribute cumulative earned fractions and restore the one debit exactly once', () => {
    const bucket = createUsageAmountAccumulator(tariff('0.00006'));
    accumulateUsageCharge(bucket, 2);
    const first = applyUsageInvoiceAmount(bucket, '60000000', 0);
    assert.equal(first.attributedMicros, 0); assert.equal(first.deltaMicros, 0); assert.equal(usageRoundingReserve(bucket), 9999);
    const second = applyUsageInvoiceAmount(bucket, '60000000', 0);
    assert.equal(second.attributedMicros, 1); assert.equal(second.deltaMicros, -1); assert.equal(usageRoundingReserve(bucket), 0);
    assert.equal(bucket.invoicedExactAtoms, bucket.settledExactAtoms);
    assert.throws(() => applyUsageInvoiceAmount(bucket, '1', 0), /matching uninvoiced/);
});
test('accepted snapshots validate the exact rate and compare price contracts across catalog versions', () => {
    const first = tariff('0.002154123456', 'storage');
    assert.throws(() => assertUsageTariff({ ...first, unitPriceAtoms: '1' }), /requires review/);
    assert.throws(() => assertUsageTariff({ ...first, aggregation: 'sum' }), /requires review/);
    assert.equal(sameUsageTariffRate(first, { ...first, id: 'next-plan-catalog', catalogVersion: 'next' }), true);
    assert.equal(sameUsageTariffRate(first, { ...first, priceId: 'price_new' }), false);
    assert.throws(() => quoteUsageQuantity(first, 1.5), /integer/);
    assert.throws(() => quoteUsageQuantity(tariff('999999999999999'), 2), /supported range/);
});

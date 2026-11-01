import test from 'node:test';
import assert from 'node:assert/strict';
import { usagePricePresentation } from './usage-presentation';
import { createUsageTariffSnapshot, type UsageTariffPair } from './usage-tariff';

function tariffs(tier: 'recurring' | 'lifetime', audio = '0.25', storage = '0.02'): UsageTariffPair {
    const common = { catalogVersion: 'published-test', usageTier: tier, currency: 'usd' as const };
    return { transcription: createUsageTariffSnapshot({ ...common, kind: 'transcription', priceId: `price_${tier}_audio`, meterId: `meter_${tier}_audio`, eventName: `${tier}_audio`,
        quantityUnit: 'weighted_15s_block', aggregation: 'sum', unitAmountDecimal: audio, minimumChargeMicros: tier === 'recurring' ? 10_000 : 0 }),
    storage: createUsageTariffSnapshot({ ...common, kind: 'storage', priceId: `price_${tier}_storage`, meterId: `meter_${tier}_storage`, eventName: `${tier}_storage`,
        quantityUnit: 'milliGiB', aggregation: 'last', unitAmountDecimal: storage, minimumChargeMicros: 0 }) };
}
test('published quantity prices drive both families without cost-derived or hardcoded retail fallback', () => {
    assert.equal(usagePricePresentation('recurring').ready, false);
    assert.equal(usagePricePresentation('lifetime').ready, false);
    const recurring = usagePricePresentation('recurring', tariffs('recurring'));
    assert.deepEqual(recurring.providers.map(row => row.usdPerMinute), ['0.01', '0.03', '0.05']);
    assert.equal(recurring.storageUsdPerGiB, '0.2');
    assert.equal(recurring.minimumRecordingUsd, '0.01');
    const changed = usagePricePresentation('recurring', tariffs('recurring', '0.3', '0.04'));
    assert.deepEqual(changed.providers.map(row => row.usdPerMinute), ['0.012', '0.036', '0.06']);
    assert.equal(changed.minimumRecordingUsd, '0.012', 'The integer-unit minimum is displayed without promising exactly one cent');
    const lifetime = usagePricePresentation('lifetime', tariffs('lifetime', '0.000000006', '0.00206937'));
    assert.equal(lifetime.minimumRecordingUsd, '0');
    assert.equal(lifetime.storageUsdPerGiB, '0.0206937');
    assert.equal(lifetime.providers[0].usdPerMinute, '0.00000000024');
    assert.equal(lifetime.transcription?.quantityUnit, 'weighted_15s_block');
    assert.equal(lifetime.ready, true);
    assert.equal(usagePricePresentation('recurring', tariffs('lifetime')).ready, false);
    const text = JSON.stringify(lifetime);
    for (const privateField of ['minimumMarginBps', 'costMicrosPerAudioMinute', 'paymentFixedMicros', 'costFingerprint', 'lifetimeHostingReserveMicros']) assert.ok(!text.includes(privateField));
});
